class Evented {
  constructor () {
    this.events = new Map()
  }

  on (eventName, callback) {
    let callbacks = this.events.get(eventName)

    if (!callbacks) {
      callbacks = new Set()
      this.events.set(eventName, callbacks)
    }

    callbacks.add(callback)

    return function removeCallback () {
      callbacks.delete(callback)
    }
  }

  emit (eventName, ...args) {
    const callbacks = this.events.get(eventName)

    if (callbacks) {
      for (const callback of callbacks) {
        Reflect.apply(callback, null, args)
      }
    }
  }
}

module.exports = Evented
