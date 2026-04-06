import { beforeEach, describe, expect, test } from 'bun:test'
import { call as buddyCommand } from '../../commands/buddy/buddy.js'
import { getCompanion } from '../companion.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import type { StoredCompanion } from '../types.js'

function seedCompanion(): StoredCompanion {
  const stored: StoredCompanion = {
    name: 'Buddy',
    personality: 'Calm and curious',
    seed: 'buddy-test-seed',
    hatchedAt: 123,
  }
  saveGlobalConfig(cfg => ({
    ...cfg,
    companion: stored,
    companionMuted: false,
  }))
  return stored
}

async function runBuddyCommand(args: string): Promise<string> {
  const outputs: string[] = []
  await buddyCommand(
    (message: string) => {
      outputs.push(message)
    },
    {
      messages: [],
      getAppState: () => ({}) as any,
      setAppState: () => {},
    } as any,
    args,
  )
  return outputs.join('\n')
}

describe('buddy customization commands', () => {
  beforeEach(() => {
    saveGlobalConfig(cfg => ({
      ...cfg,
      companion: undefined,
      companionMuted: false,
    }))
  })

  test('set species stores override and affects rendered companion', async () => {
    seedCompanion()

    const output = await runBuddyCommand('set species cat')

    expect(output).toContain('updated species')
    expect(getGlobalConfig().companion?.overrides?.species).toBe('cat')
    expect(getCompanion()?.species).toBe('cat')
  })

  test('set stats out of range is rejected', async () => {
    seedCompanion()

    const output = await runBuddyCommand('set stats.WISDOM 200')

    expect(output).toContain('invalid stat value')
    expect(getGlobalConfig().companion?.overrides?.stats?.WISDOM).toBeUndefined()
  })

  test('reset all removes every override', async () => {
    seedCompanion()
    await runBuddyCommand('set species dragon')
    await runBuddyCommand('set rarity epic')

    const output = await runBuddyCommand('reset all')

    expect(output).toContain('reset all overrides to random')
    expect(getGlobalConfig().companion?.overrides).toBeUndefined()
  })

  test('show reports none when no overrides are present', async () => {
    seedCompanion()

    const output = await runBuddyCommand('show')

    expect(output).toContain('Overrides: none (using random seed roll)')
  })

  test('set shiny accepts truthy text values', async () => {
    seedCompanion()

    const output = await runBuddyCommand('set shiny yes')

    expect(output).toContain('updated shiny')
    expect(getGlobalConfig().companion?.overrides?.shiny).toBe(true)
  })

  test('set rainbow accepts true and reset rainbow clears it', async () => {
    seedCompanion()

    const setOutput = await runBuddyCommand('set rainbow true')
    expect(setOutput).toContain('updated rainbow')
    expect(getGlobalConfig().companion?.overrides?.rainbow).toBe(true)

    const resetOutput = await runBuddyCommand('reset rainbow')
    expect(resetOutput).toContain('reset rainbow')
    expect(getGlobalConfig().companion?.overrides?.rainbow).toBeUndefined()
  })

  test('reset stats.<STAT> removes only that stat override', async () => {
    seedCompanion()
    await runBuddyCommand('set stats.WISDOM 90')
    await runBuddyCommand('set stats.SNARK 20')

    const output = await runBuddyCommand('reset stats.WISDOM')

    expect(output).toContain('reset stats.wisdom')
    expect(getGlobalConfig().companion?.overrides?.stats?.WISDOM).toBeUndefined()
    expect(getGlobalConfig().companion?.overrides?.stats?.SNARK).toBe(20)
  })

  test('reset name restores species default name', async () => {
    seedCompanion()
    await runBuddyCommand('set species cat')
    await runBuddyCommand('set name Fluffy')

    const output = await runBuddyCommand('reset name')

    expect(output).toContain('reset name to species default')
    expect(getGlobalConfig().companion?.name).toBe('Whiskers')
  })
})

describe('companion override merge', () => {
  beforeEach(() => {
    saveGlobalConfig(cfg => ({
      ...cfg,
      companion: undefined,
      companionMuted: false,
    }))
  })

  test('getCompanion clamps persisted override stats to 0-100', () => {
    const stored = seedCompanion()
    saveGlobalConfig(cfg => ({
      ...cfg,
      companion: {
        ...stored,
        overrides: {
          stats: {
            WISDOM: 999,
            SNARK: -50,
          },
        },
      },
    }))

    const companion = getCompanion()

    expect(companion?.stats.WISDOM).toBe(100)
    expect(companion?.stats.SNARK).toBe(0)
  })
})
