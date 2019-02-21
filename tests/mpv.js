/* eslint-env jest */
const Mpv = require('..')

describe('Mpv', () => {
  let mpv

  test('init', () => {
    mpv = new Mpv()
  })

  test('get_version', async () => {
    const version = await mpv.command('get_version')
    expect(version).toBe(65637)
  })

  test('close', () => {
    mpv.close()
  })
})
