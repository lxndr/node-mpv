let id = 1

function uniqueId () {
  return id++
}

module.exports = uniqueId
