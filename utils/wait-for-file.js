const fs = require('fs')

function waitForFile ({filename, timeout = 5000, interval = 200}) {
  return new Promise((resolve, reject) => {
    const succeess = () => {
      clearInterval(intervalId)
      clearTimeout(timeoutId)
      resolve()
    }

    const failure = () => {
      clearInterval(intervalId)
      clearTimeout(timeoutId)
      reject(new Error('Timed out'))
    }

    const check = () => {
      fs.access(filename, err => {
        if (!err) {
          succeess()
        }
      })
    }

    const intervalId = setInterval(check, interval)
    const timeoutId = setTimeout(failure, timeout)
  })
}

module.exports = waitForFile
