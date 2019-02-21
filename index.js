const fs = require('fs')
const os = require('os')
const net = require('net')
const path = require('path')
const log = require('debug')('mpv')
const { spawn } = require('child_process')
const defer = require('p-defer')

const Evented = require('./utils/evented')
const uniqueId = require('./utils/unique-id')
const waitForFile = require('./utils/wait-for-file')

/**
 * @typedef {import('net').Socket} Socket
 * @typedef {import('child_process').ChildProcess} ChildProcess
 * @typedef {import('p-defer').DeferredPromise} DeferredPromise
 * @typedef {import('./utils/evented').EventCallback} EventCallback
 */

/**
 * @typedef Request
 * @property {string} packet
 * @property {DeferredPromise} deferred
 * @property {boolean} sent
 */

/**
 * @typedef Response
 * @property {number} request_id
 * @property {string} event
 * @property {string} error
 * @property {*} [data]
 */

/**
 * @returns {string}
 */
function generatePipeName () {
  switch (os.platform()) {
    case 'win32':
      return '\\\\.\\pipe\\node-mpv'
    default:
      return '/tmp/node-mpv-ipc'
  }
}

/**
 * @returns {string}
 */
function findExecutable () {
  switch (os.platform()) {
    case 'win32':
      switch (os.arch()) {
        case 'win32':
          return path.join(__dirname, 'bin/win32/mpv.exe')
        case 'win64':
          return path.join(__dirname, 'bin/win64/mpv.exe')
      }
      break
    default:
      return 'mpv'
  }
}

class Mpv {
  /**
   * @param {object} [options]
   * @param {string} [options.exec]
   * @param {string} [options.execPipe]
   * @param {number} [options.execTimeout]
   */
  constructor (options = {}) {
    this.exec = options.exec || findExecutable()
    this.execPipe = options.execPipe || generatePipeName()
    this.execTimeout = options.execTimeout || 60000

    this.events = new Evented()
    this.observables = new Evented()

    /** @type {Map<number, Request>} */
    this.requests = new Map()

    /** @type {string} */
    this.buffer = ''

    this.pipeWatcher = null

    /** @type {?ChildProcess} */
    this.cp = null

    /** @type {?Socket} */
    this.sock = null

    /** @type {boolean} */
    this.closed = false

    this.on('property-change', ({ name, data }) => {
      this.observables.emit(name, data)
    })

    this._init()
  }

  /**
   * @private
   */
  _init () {
    fs.unlink(this.execPipe, (error) => {
      if (this.closed) {
        return
      }

      if (error && error.code !== 'ENOENT') {
        this._fatalError(new Error('Could not remove pipe file'))
        return
      }

      this._spawn()

      this.pipeWatcher = waitForFile({
        filename: this.execPipe,
        timeout: this.execTimeout,
        onsuccess: () => {
          this._connect()
        },
        ontimeout: () => {
          this._fatalError(new Error('Pipe timed out'))
        }
      })
    })
  }

  /**
   * @private
   */
  _spawn () {
    if (this.closed) {
      return
    }

    this.cp = spawn(this.exec, [
      '--idle',
      '--really-quiet',
      '--no-terminal',
      '--no-video',
      '--no-config',
      '--input-ipc-server', this.execPipe
    ], {
      detached: false,
      windowsHide: true
    })

    this.cp.on('close', () => {
      this._fatalError(new Error('MPV executable was unexpectably terminated'))
    })
  }

  /**
   * @private
   */
  async _connect () {
    if (this.closed) {
      return
    }

    this.sock = net.connect(this.execPipe, () => {
      this._flush()
    })

    this.sock.on('close', () => {
      this._fatalError(new Error('Socket connection was unexpectably terminated'))
    })

    this.sock.on('error', (error) => {
      this._fatalError(error)
    })

    this.sock.on('data', data => {
      this.buffer += data.toString()

      const responses = this.buffer.split('\n')
      if (responses.length === 1) return
      this.buffer = responses.pop()

      for (const response of responses) {
        log('sends', response)
        this._processResponse(JSON.parse(response))
      }
    })
  }

  /**
   * @private
   * @param {Error} error
   */
  _fatalError (error) {
    this.close()
    this.events.emit('error', error)
  }

  /**
   *
   */
  close () {
    this.closed = true

    if (this.pipeWatcher) {
      this.pipeWatcher.stop()
      this.pipeWatcher = null
    }

    if (this.sock) {
      this.sock.end()
      this.sock.destroy()
      this.sock = null
    }

    if (this.cp) {
      this.cp.kill()
      this.cp = null
    }

    fs.unlink(this.execPipe, () => {})
  }

  /**
   * @param {string} command
   * @param {...*} args
   * @returns {Promise<*>}
   */
  async command (command, ...args) {
    const id = uniqueId()
    const deferred = defer()

    const packet = JSON.stringify({
      request_id: id,
      command: [command, ...args]
    })

    /** @type {Request} */
    const request = { deferred, packet, sent: false }
    this.requests.set(id, request)

    this._flush()
    return deferred.promise
  }

  /**
   * @private
   */
  _flush () {
    if (!this.sock) {
      return
    }

    for (const [, request] of this.requests) {
      if (request.sent) continue
      log('receives', request.packet)
      this.sock.write(request.packet + '\n')
      request.sent = true
    }
  }

  /**
   * @private
   * @param {Response} response
   */
  _processResponse (response) {
    const { request_id, event, error, ...rest } = response

    if (error && request_id) {
      const request = this.requests.get(request_id)

      if (error === 'success') {
        request.deferred.resolve(rest.data)
      } else {
        request.deferred.reject(new Error(error))
      }

      this.requests.delete(request_id)
    } else if (event) {
      this.events.emit(event, rest)
    } else {
      console.warn('Unknown response:', response)
    }
  }

  /**
   * @param {string} eventName
   * @param {EventCallback} callback
   */
  on (eventName, callback) {
    return this.events.on(eventName, callback)
  }

  /**
   * @param {string} propertyName
   * @param {EventCallback} callback
   */
  async observe (propertyName, callback) {
    const id = uniqueId()
    await this.command('observe_property', id, propertyName)

    const unsubscribe = this.observables.on(propertyName, callback)

    return async function removeCallback () {
      await this.command('unobserve_property', id)
      unsubscribe()
    }
  }

  /**
   * @param {string} propertyName
   * @returns {Promise<*>}
   */
  async get (propertyName) {
    return this.command('get_property', propertyName)
  }

  /**
   * @param {string} propertyName
   * @param {string} value
   * @returns {Promise<void>}
   */
  async set (propertyName, value) {
    await this.command('set_property', propertyName, value)
  }
}

module.exports = Mpv
