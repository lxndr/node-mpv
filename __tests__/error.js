/* eslint-env jest */
const Mpv = require('..')

describe('Mpv errors', () => {
  test('mpv porcess is killed', (done) => {
    const mpv = new Mpv()

    mpv.on('error', (err) => {
      expect(err.message).toBe('MPV executable was unexpectably terminated')
      expect(mpv.closed).toBe(true)
      done()
    })

    process.kill(mpv.cp.pid)
  })
})
