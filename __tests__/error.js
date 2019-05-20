/* eslint-env jest */
const Mpv = require('..')

describe('Mpv errors', () => {
  test('mpv porcess is killed', (done) => {
    const mpv = new Mpv()

    mpv.on('connect', () => {
      process.kill(mpv.cp.pid)
    })

    mpv.on('error', (err) => {
      expect(err.message).toBeTruthy()
      expect(mpv.closed).toBe(true)
      mpv.close()
      done()
    })
  })
})
