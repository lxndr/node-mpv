/**
 * @callback EventCallback
 */

/**
 *
 */
class Evented {
  constructor () {
    /** @type {Map<string, Set<EventCallback>>} */
    this.events = new Map()
  }

  /**
   * @param {string} eventName
   * @param {EventCallback} callback
   */
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

  /**
   * @param {string} eventName
   * @param {...*} args
   */
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
