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

  test('set volume', async () => {
    await mpv.set('volume', 50)
  })

  test('get volume', async () => {
    const volume = await mpv.get('volume')
    expect(volume).toBe(50)
  })

  describe('property observation', () => {
    let unsubFn

    test('subscribe', async () => {
      unsubFn = await mpv.observe('volume')
    })

    test('unsubscribe', async () => {
      await unsubFn()
    })
  })

  test('close', () => {
    mpv.close()
  })

  describe('after mpv has been closed', () => {
    test('cannot init again', () => {
      mpv._init()
      expect(mpv.cp).toBe(null)
      expect(mpv.sock).toBe(null)
    })

    test('cannot reconnect', () => {
      mpv._reconnect()
      expect(mpv.cp).toBe(null)
      expect(mpv.sock).toBe(null)
    })

    test('close has no effect', () => {
      mpv.close()
      expect(mpv.cp).toBe(null)
      expect(mpv.sock).toBe(null)
    })
  })
})
