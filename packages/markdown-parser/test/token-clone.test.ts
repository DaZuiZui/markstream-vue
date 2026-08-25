import { describe, expect, it } from 'vitest'
import { cloneMarkdownTokens } from '../src/parser/token-clone'

describe('cloneMarkdownTokens', () => {
  it('preserves enumerable accessor descriptors', () => {
    const pluginState = { value: 'cached' }
    const token = {
      type: 'inline',
      attrs: null,
      map: null,
      children: null,
    } as any
    Object.defineProperty(token, 'pluginState', {
      configurable: false,
      enumerable: true,
      get: () => pluginState,
    })

    const cloned = cloneMarkdownTokens([token])[0] as any
    const descriptor = Object.getOwnPropertyDescriptor(cloned, 'pluginState')

    expect(descriptor?.get).toBeDefined()
    expect(descriptor?.configurable).toBe(false)
    expect(descriptor && 'value' in descriptor).toBe(false)
    expect(cloned.pluginState).toBe(pluginState)
  })

  it('preserves constrained enumerable data descriptors', () => {
    const token = {
      type: 'inline',
      attrs: null,
      map: null,
      children: null,
    } as any
    Object.defineProperty(token, 'pluginState', {
      configurable: false,
      enumerable: true,
      writable: false,
      value: { value: 'cached' },
    })

    const cloned = cloneMarkdownTokens([token])[0] as any
    const descriptor = Object.getOwnPropertyDescriptor(cloned, 'pluginState')

    expect(descriptor).toMatchObject({
      configurable: false,
      enumerable: true,
      writable: false,
    })
    expect(descriptor?.value).toEqual({ value: 'cached' })
    expect(descriptor?.value).not.toBe(Object.getOwnPropertyDescriptor(token, 'pluginState')?.value)
  })

  it('preserves an enumerable own __proto__ data field', () => {
    const token = {
      type: 'inline',
      attrs: null,
      map: null,
      children: null,
    } as any
    Object.defineProperty(token, '__proto__', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: { plugin: true },
    })

    const cloned = cloneMarkdownTokens([token])[0] as any

    expect(Object.hasOwn(cloned, '__proto__')).toBe(true)
    expect(Object.getOwnPropertyDescriptor(cloned, '__proto__')?.value).toEqual({ plugin: true })
    expect(Object.getPrototypeOf(cloned)).toBe(Object.getPrototypeOf(token))
  })
})
