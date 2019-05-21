/**
 * @callback EventCallback
 * @param {...*} args
 * @returns {void}
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
   * @private
   * @param {string} eventName
   */
  _ensure (eventName) {
    let callbacks = this.events.get(eventName)

    if (callbacks) {
      return callbacks
    }

    callbacks = new Set()
    this.events.set(eventName, callbacks)
    return callbacks
  }

  /**
   * @param {string} eventName
   * @param {EventCallback} callback
   */
  on (eventName, callback) {
    const callbacks = this._ensure(eventName)
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
