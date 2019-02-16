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
   * @param {string} [options.pipeName]
   */
  constructor (options = {}) {
    const {
      exec = findExecutable(),
      pipeName = generatePipeName()
    } = options

    this.events = new Evented()
    this.observables = new Evented()
    this.requests = new Map()
    this.buffer = ''

    this.on('property-change', ({ name, data }) => {
      this.observables.emit(name, data)
    })

    this._init({ exec, pipeName })
  }

  /**
   * @private
   * @param {object} options
   * @param {string} options.exec
   * @param {string} options.pipeName
   */
  _init ({ exec, pipeName }) {
    fs.unlink(pipeName, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error(new Error('could not remove pipe file'))
        return
      }

      this._spawn({ exec, pipeName })

      waitForFile({
        filename: pipeName,
        timeout: 5000,
        onsuccess: () => {
          this._connect({ pipeName })
        },
        ontimeout: () => {
          console.error(new Error('pipe watcher timed out'))
        }
      })
    })
  }

  /**
   * @private
   * @param {object} options
   * @param {string} options.exec
   * @param {string} options.pipeName
   */
  _spawn ({ exec, pipeName }) {
    this.cp = spawn(exec, [
      '--idle',
      '--really-quiet',
      '--no-terminal',
      '--no-video',
      '--no-config',
      '--input-ipc-server', pipeName
    ], {
      detached: false,
      windowsHide: true
    })
  }

  /**
   * @private
   * @param {object} options
   * @param {string} options.pipeName
   */
  async _connect ({ pipeName }) {
    this.sock = net.connect(pipeName, () => {
      this._flush()
    })

    this.sock.on('error', (...args) => {
      console.error(...args)
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
   * 
   */
  close () {
    this.sock.end()
    this.cp.kill()
  }

  /**
   * @param {string} command
   * @returns {Promise<string>}
   */
  async command (command, ...args) {
    const id = uniqueId()
    const deferred = defer()

    const packet = {
      request_id: id,
      command: [command, ...args]
    }

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
      const data = JSON.stringify(request.packet)
      log('receives', data)
      this.sock.write(data + '\n')
      request.sent = true
    }
  }

  /**
   * @private
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
   */
  on (eventName, ...args) {
    return this.events.on(eventName, ...args)
  }

  /**
   * @param {string} propertyName
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
   * @returns {Promise<string>}
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
