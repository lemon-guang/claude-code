import React from 'react'
import {
  getCompanion,
  rollWithSeed,
  generateSeed,
} from '../../buddy/companion.js'
import {
  type StoredCompanion,
  EYES,
  HATS,
  RARITIES,
  RARITY_STARS,
  SPECIES,
  STAT_NAMES,
  type StatName,
} from '../../buddy/types.js'
import { renderSprite } from '../../buddy/sprites.js'
import { CompanionCard } from '../../buddy/CompanionCard.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { triggerCompanionReaction } from '../../buddy/companionReact.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'

// Species → default name fragments for hatch (no API needed)
const SPECIES_NAMES: Record<string, string> = {
  duck: 'Waddles',
  goose: 'Goosberry',
  blob: 'Gooey',
  cat: 'Whiskers',
  dragon: 'Ember',
  octopus: 'Inky',
  owl: 'Hoots',
  penguin: 'Waddleford',
  turtle: 'Shelly',
  snail: 'Trailblazer',
  ghost: 'Casper',
  axolotl: 'Axie',
  capybara: 'Chill',
  cactus: 'Spike',
  robot: 'Byte',
  rabbit: 'Flops',
  mushroom: 'Spore',
  chonk: 'Chonk',
}

const SPECIES_PERSONALITY: Record<string, string> = {
  duck: 'Quirky and easily amused. Leaves rubber duck debugging tips everywhere.',
  goose: 'Assertive and honks at bad code. Takes no prisoners in code reviews.',
  blob: 'Adaptable and goes with the flow. Sometimes splits into two when confused.',
  cat: 'Independent and judgmental. Watches you type with mild disdain.',
  dragon:
    'Fiery and passionate about architecture. Hoards good variable names.',
  octopus:
    'Multitasker extraordinaire. Wraps tentacles around every problem at once.',
  owl: 'Wise but verbose. Always says "let me think about that" for exactly 3 seconds.',
  penguin: 'Cool under pressure. Slides gracefully through merge conflicts.',
  turtle: 'Patient and thorough. Believes slow and steady wins the deploy.',
  snail: 'Methodical and leaves a trail of useful comments. Never rushes.',
  ghost:
    'Ethereal and appears at the worst possible moments with spooky insights.',
  axolotl: 'Regenerative and cheerful. Recovers from any bug with a smile.',
  capybara: 'Zen master. Remains calm while everything around is on fire.',
  cactus:
    'Prickly on the outside but full of good intentions. Thrives on neglect.',
  robot: 'Efficient and literal. Processes feedback in binary.',
  rabbit: 'Energetic and hops between tasks. Finishes before you start.',
  mushroom: 'Quietly insightful. Grows on you over time.',
  chonk:
    'Big, warm, and takes up the whole couch. Prioritizes comfort over elegance.',
}

function speciesLabel(species: string): string {
  return species.charAt(0).toUpperCase() + species.slice(1)
}

function defaultNameForSpecies(species: string): string {
  return SPECIES_NAMES[species] ?? 'Buddy'
}

function defaultPersonalityForSpecies(species: string): string {
  return SPECIES_PERSONALITY[species] ?? 'Mysterious and code-savvy.'
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return undefined
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function pruneOverrides(companion: StoredCompanion): StoredCompanion {
  const overrides = companion.overrides
  if (!overrides) return companion

  const nextStats = overrides.stats
    ? Object.fromEntries(
        Object.entries(overrides.stats).filter(([, value]) => value != null),
      )
    : undefined
  const nextOverrides = {
    ...overrides,
    stats:
      nextStats && Object.keys(nextStats).length > 0
        ? (nextStats as Partial<Record<StatName, number>>)
        : undefined,
  }

  if (
    nextOverrides.rarity == null &&
    nextOverrides.species == null &&
    nextOverrides.eye == null &&
    nextOverrides.hat == null &&
    nextOverrides.shiny == null &&
    nextOverrides.rainbow == null &&
    nextOverrides.stats == null
  ) {
    return { ...companion, overrides: undefined }
  }

  return { ...companion, overrides: nextOverrides }
}

function buildShowLines(companion: ReturnType<typeof getCompanion>): string[] {
  if (!companion) return ['no companion yet · run /buddy first']
  const overrides = getGlobalConfig().companion?.overrides
  const lines = [
    `${companion.name} the ${speciesLabel(companion.species)}`,
    `Rarity: ${RARITY_STARS[companion.rarity]} (${companion.rarity})`,
    `Eye: ${companion.eye} · Hat: ${companion.hat} · Shiny: ${companion.shiny ? 'yes' : 'no'}`,
    `Personality: ${companion.personality}`,
    `Stats: ${STAT_NAMES.map(name => `${name}=${companion.stats[name]}`).join(' · ')}`,
  ]

  if (!overrides) {
    lines.push('', 'Overrides: none (using random seed roll)')
    return lines
  }

  const active = [
    overrides.species ? `species=${overrides.species}` : undefined,
    overrides.rarity ? `rarity=${overrides.rarity}` : undefined,
    overrides.eye ? `eye=${overrides.eye}` : undefined,
    overrides.hat ? `hat=${overrides.hat}` : undefined,
    overrides.shiny != null ? `shiny=${String(overrides.shiny)}` : undefined,
    overrides.rainbow != null ? `rainbow=${String(overrides.rainbow)}` : undefined,
    ...(overrides.stats
      ? Object.entries(overrides.stats).map(([k, v]) => `${k}=${v}`)
      : []),
  ].filter(Boolean)

  lines.push('', `Overrides: ${active.length > 0 ? active.join(' · ') : 'none'}`)
  return lines
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const raw = args?.trim() ?? ''
  const [subRaw, ...restTokens] = raw.length > 0 ? raw.split(/\s+/) : ['']
  const sub = subRaw.toLowerCase()
  const rest = restTokens.join(' ').trim()
  const setState = context.setAppState

  // ── /buddy off — mute companion ──
  if (sub === 'off' || sub === 'mute') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: true }))
    onDone('companion muted', { display: 'system' })
    return null
  }

  // ── /buddy on — unmute companion ──
  if (sub === 'on' || sub === 'unmute') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    onDone('companion unmuted', { display: 'system' })
    return null
  }

  if (sub === 'show' || sub === 'settings' || sub === 'config') {
    const current = getCompanion()
    onDone(buildShowLines(current).join('\n'), { display: 'system' })
    return null
  }

  if (sub === 'set') {
    const [keyRaw, ...valueParts] = rest.split(/\s+/)
    const key = keyRaw?.toLowerCase()
    const value = valueParts.join(' ')

    if (!key || valueParts.length === 0) {
      onDone(
        'usage: /buddy set <name|personality|species|rarity|eye|hat|shiny|rainbow|stats.<STAT>> <value>',
        { display: 'system' },
      )
      return null
    }

    const currentStored = getGlobalConfig().companion
    if (!currentStored) {
      onDone('no companion yet · run /buddy first', { display: 'system' })
      return null
    }

    const trimmed = trimOrUndefined(value)
    if (!trimmed) {
      onDone('value cannot be empty', { display: 'system' })
      return null
    }

    if (key === 'name') {
      if (trimmed.length > 40) {
        onDone('name is too long (max 40 chars)', { display: 'system' })
        return null
      }
      saveGlobalConfig(cfg => ({
        ...cfg,
        companion: { ...(cfg.companion as StoredCompanion), name: trimmed },
      }))
      onDone(`updated companion name to ${trimmed}`, { display: 'system' })
      return null
    }

    if (key === 'personality') {
      if (trimmed.length > 200) {
        onDone('personality is too long (max 200 chars)', {
          display: 'system',
        })
        return null
      }
      saveGlobalConfig(cfg => ({
        ...cfg,
        companion: {
          ...(cfg.companion as StoredCompanion),
          personality: trimmed,
        },
      }))
      onDone('updated companion personality', { display: 'system' })
      return null
    }

    const next = { ...currentStored, overrides: { ...currentStored.overrides } }

    if (key === 'species') {
      if (!SPECIES.includes(trimmed as (typeof SPECIES)[number])) {
        onDone(`invalid species: ${trimmed}`, { display: 'system' })
        return null
      }
      next.overrides!.species = trimmed as (typeof SPECIES)[number]
    } else if (key === 'rarity') {
      if (!RARITIES.includes(trimmed as (typeof RARITIES)[number])) {
        onDone(`invalid rarity: ${trimmed}`, { display: 'system' })
        return null
      }
      next.overrides!.rarity = trimmed as (typeof RARITIES)[number]
    } else if (key === 'eye') {
      if (!EYES.includes(trimmed as (typeof EYES)[number])) {
        onDone(`invalid eye: ${trimmed}`, { display: 'system' })
        return null
      }
      next.overrides!.eye = trimmed as (typeof EYES)[number]
    } else if (key === 'hat') {
      if (!HATS.includes(trimmed as (typeof HATS)[number])) {
        onDone(`invalid hat: ${trimmed}`, { display: 'system' })
        return null
      }
      next.overrides!.hat = trimmed as (typeof HATS)[number]
    } else if (key === 'shiny') {
      const boolValue = parseBoolean(trimmed)
      if (boolValue == null) {
        onDone('invalid shiny value: use true/false', { display: 'system' })
        return null
      }
      next.overrides!.shiny = boolValue
    } else if (key === 'rainbow') {
      const boolValue = parseBoolean(trimmed)
      if (boolValue == null) {
        onDone('invalid rainbow value: use true/false', { display: 'system' })
        return null
      }
      next.overrides!.rainbow = boolValue
    } else if (key.startsWith('stats.')) {
      const statName = key.slice('stats.'.length).toUpperCase()
      if (!STAT_NAMES.includes(statName as StatName)) {
        onDone(`invalid stat: ${statName}`, { display: 'system' })
        return null
      }
      const statValue = Number(trimmed)
      if (!Number.isFinite(statValue) || statValue < 0 || statValue > 100) {
        onDone('invalid stat value: use a number from 0 to 100', {
          display: 'system',
        })
        return null
      }
      next.overrides!.stats = {
        ...(next.overrides!.stats ?? {}),
        [statName]: Math.round(statValue),
      }
    } else {
      onDone(
        `unsupported setting key: ${key} · valid keys: name, personality, species, rarity, eye, hat, shiny, rainbow, stats.<STAT>`,
        { display: 'system' },
      )
      return null
    }

    const normalized = pruneOverrides(next)
    saveGlobalConfig(cfg => ({ ...cfg, companion: normalized }))
    onDone(`updated ${key}`, { display: 'system' })
    return null
  }

  if (sub === 'reset') {
    const target = rest.toLowerCase()
    if (!target) {
      onDone(
        'usage: /buddy reset <all|name|personality|species|rarity|eye|hat|shiny|rainbow|stats.<STAT>>',
        {
          display: 'system',
        },
      )
      return null
    }

    const currentStored = getGlobalConfig().companion
    if (!currentStored) {
      onDone('no companion yet · run /buddy first', { display: 'system' })
      return null
    }

    if (target === 'all') {
      saveGlobalConfig(cfg => ({
        ...cfg,
        companion: {
          ...(cfg.companion as StoredCompanion),
          overrides: undefined,
        },
      }))
      onDone('reset all overrides to random', { display: 'system' })
      return null
    }

    if (target === 'name' || target === 'personality') {
      const current = getCompanion()
      const species = current?.species ?? 'duck'
      saveGlobalConfig(cfg => ({
        ...cfg,
        companion: {
          ...(cfg.companion as StoredCompanion),
          name:
            target === 'name'
              ? defaultNameForSpecies(species)
              : (cfg.companion as StoredCompanion).name,
          personality:
            target === 'personality'
              ? defaultPersonalityForSpecies(species)
              : (cfg.companion as StoredCompanion).personality,
        },
      }))
      onDone(`reset ${target} to species default`, { display: 'system' })
      return null
    }

    const next: StoredCompanion = {
      ...currentStored,
      overrides: { ...(currentStored.overrides ?? {}) },
    }

    if (target === 'species') {
      next.overrides!.species = undefined
    } else if (target === 'rarity') {
      next.overrides!.rarity = undefined
    } else if (target === 'eye') {
      next.overrides!.eye = undefined
    } else if (target === 'hat') {
      next.overrides!.hat = undefined
    } else if (target === 'shiny') {
      next.overrides!.shiny = undefined
    } else if (target === 'rainbow') {
      next.overrides!.rainbow = undefined
    } else if (target.startsWith('stats.')) {
      const statName = target.slice('stats.'.length).toUpperCase()
      if (!STAT_NAMES.includes(statName as StatName)) {
        onDone(`invalid stat: ${statName}`, { display: 'system' })
        return null
      }
      next.overrides!.stats = {
        ...(next.overrides!.stats ?? {}),
        [statName]: undefined,
      }
    } else {
      onDone(
        `unsupported reset key: ${target} · valid keys: all, name, personality, species, rarity, eye, hat, shiny, rainbow, stats.<STAT>`,
        { display: 'system' },
      )
      return null
    }

    const normalized = pruneOverrides(next)
    saveGlobalConfig(cfg => ({ ...cfg, companion: normalized }))
    onDone(`reset ${target}`, { display: 'system' })
    return null
  }

  // ── /buddy pet — trigger heart animation + auto unmute ──
  if (sub === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      onDone('no companion yet \u00b7 run /buddy first', { display: 'system' })
      return null
    }

    // Auto-unmute on pet + trigger heart animation
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    setState?.(prev => ({ ...prev, companionPetAt: Date.now() }))

    // Trigger a post-pet reaction
    triggerCompanionReaction(context.messages ?? [], reaction =>
      setState?.(prev =>
        prev.companionReaction === reaction
          ? prev
          : { ...prev, companionReaction: reaction },
      ),
    )

    onDone(`petted ${companion.name}`, { display: 'system' })
    return null
  }

  // ── /buddy (no args) — show existing or hatch ──
  const companion = getCompanion()

  // Auto-unmute when viewing
  if (companion && getGlobalConfig().companionMuted) {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
  }

  if (companion) {
    // Return JSX card — matches official vc8 component
    const lastReaction = context.getAppState?.()?.companionReaction
    return React.createElement(CompanionCard, {
      companion,
      lastReaction,
      onDone,
    })
  }

  // ── No companion → hatch ──
  const seed = generateSeed()
  const r = rollWithSeed(seed)
  const name = SPECIES_NAMES[r.bones.species] ?? 'Buddy'
  const personality =
    SPECIES_PERSONALITY[r.bones.species] ?? 'Mysterious and code-savvy.'

  const stored: StoredCompanion = {
    name,
    personality,
    seed,
    hatchedAt: Date.now(),
  }

  saveGlobalConfig(cfg => ({ ...cfg, companion: stored }))

  const stars = RARITY_STARS[r.bones.rarity]
  const sprite = renderSprite(r.bones, 0)
  const shiny = r.bones.shiny ? ' \u2728 Shiny!' : ''

  const lines = [
    'A wild companion appeared!',
    '',
    ...sprite,
    '',
    `${name} the ${speciesLabel(r.bones.species)}${shiny}`,
    `Rarity: ${stars} (${r.bones.rarity})`,
    `"${personality}"`,
    '',
    'Your companion will now appear beside your input box!',
    'Say its name to get its take \u00b7 /buddy pet \u00b7 /buddy off',
  ]
  onDone(lines.join('\n'), { display: 'system' })
  return null
}
