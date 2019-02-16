const chokidar = require('chokidar')

/**
 * @param {object} options
 * @param {string} options.filename
 * @param {number} options.timeout
 * @param {Function} options.onsuccess
 * @param {Function} options.ontimeout
 */
function waitForFile ({ filename, timeout, onsuccess, ontimeout }) {
  const stop = () => {
    watcher.close()
    clearTimeout(timeoutId)
  }

  const watcher = chokidar
    .watch(filename)
    .on('add', () => {
      stop()
      onsuccess()
    })

  const timeoutId = setTimeout(() => {
    stop()
    ontimeout()
  }, timeout)

  return { stop }
}

module.exports = waitForFile
