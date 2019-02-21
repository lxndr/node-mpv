let id = 1

/**
 * @returns {number}
 */
function uniqueId () {
  return id++
}

module.exports = uniqueId
