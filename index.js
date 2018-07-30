const os = require('os')
const net = require('net')
const path = require('path')
const { tmpNameSync } = require('tmp')
const { spawn } = require('child_process')

const defer = require('./utils/defer')
const Evented = require('./utils/evented')
const uniqueId = require('./utils/unique-id')
const waitForFile = require('./utils/wait-for-file')

function generatePipeName () {
  switch (os.platform()) {
    case 'win32':
      return '\\\\.\\pipe\\node-mpv'
    default:
      return tmpNameSync()
  }
}

function findExecutable () {
  switch (os.platform()) {
    case 'win32':
      return path.join(__dirname, 'bin/win32/mpv.exe')
    default:
      return 'mpv'
  }
}

class MPV {
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

    this.cp = spawn(exec, [
      '--idle',
      '--quiet',
      '--input-ipc-server', pipeName
    ])

    this.initPromise = waitForFile({filename: pipeName})
      .then(() => {
        this.sock = net.connect(pipeName, () => {
          this._flush()
        })

        this.sock.on('data', data => {
          this.buffer += data.toString()

          const responses = this.buffer.split('\n')
          if (responses.length === 1) return
          this.buffer = responses.pop()

          for (const response of responses) {
            this._processResponse(JSON.parse(response))
          }
        })

        this.sock.on('error', error => {
          console.log('ERROR', error)
        })

        this.sock.on('end', () => {
          console.log('END')
        })

        this.sock.on('timeout', () => {
          console.log('TIMEOUT')
        })

        this.sock.on('close', () => {
          console.log('CLOSE')
        })
      })
  }

  async init () {
    return this.initPromise
  }

  close () {
    this.cp.kill()
  }

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

  _flush () {
    if (!this.sock) {
      return
    }

    for (const [, request] of this.requests) {
      if (request.sent) continue
      const data = JSON.stringify(request.packet) + '\n'
      this.sock.write(data)
      request.sent = true
    }
  }

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

  on (eventName, ...args) {
    return this.events.on(eventName, ...args)
  }

  async observe (propertyName, callback) {
    const id = uniqueId()
    await this.command('observe_property', id, propertyName)

    const unsubscribe = this.observables.on(propertyName, callback)

    return async function removeCallback () {
      await this.command('unobserve_property', id)
      unsubscribe()
    }
  }

  async get (propertyName) {
    return this.command('get_property', propertyName)
  }

  async set (propertyName, value) {
    return this.command('set_property', propertyName, value)
  }
}

module.exports = MPV