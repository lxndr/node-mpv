function defer () {
  let resolve
  let reject

  const promise = new Promise((...args) => {
    resolve = args[0]
    reject = args[1]
  })

  return { resolve, reject, promise }
}

module.exports = defer
