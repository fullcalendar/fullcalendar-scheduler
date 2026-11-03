import { fileURLToPath } from 'node:url'
import { dirname, join as joinPaths } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkgDir = joinPaths(__dirname, '..')
const demoThemeDir = joinPaths(pkgDir, 'src', 'theme-breezy')

const themes = ['breezy', 'classic', 'forma', 'monarch', 'pulse']
const relativeImportReplacements: Record<string, string> = {
  '../../ui/button': '@/components/ui/button',
  '../../ui/tabs': '@/components/ui/tabs',
  '../../lib/utils': '@/lib/utils',
  './event-calendar': '@/registry/components/event-calendar',
  './event-calendar-toolbar': '@/registry/components/event-calendar-toolbar',
  './event-calendar-icons': '@/registry/components/event-calendar-icons',
  './event-calendar-views': '@/registry/ui/event-calendar-views',
  './resource-timeline': '@/registry/components/resource-timeline',
  './resource-timegrid': '@/registry/components/resource-timegrid',
  './scheduler-views': '@/registry/ui/scheduler-views',
}

const rootItems: any[] = []
await mkdir(joinPaths(pkgDir, 'registry-dist'))

for (const theme of themes) {
  // await mkdir(joinPaths(pkgDir, 'registry-dist', theme), { recursive: true })

  const themeTitle = capitalizeFirstLetter(theme)
  const eventCalendarConfig = await createEventCalendarConfig(theme, themeTitle)
  const schedulerConfig = await createSchedulerConfig(theme, themeTitle)

  await writeFile(
    joinPaths(pkgDir, 'registry-dist', `${theme}-event-calendar.json`),
    JSON.stringify(eventCalendarConfig, undefined, 2),
    'utf-8',
  )
  await writeFile(
    joinPaths(pkgDir, 'registry-dist', `${theme}-scheduler.json`),
    JSON.stringify(schedulerConfig, undefined, 2),
    'utf-8',
  )

  // HACK: make suitable for registry.json
  delete (eventCalendarConfig as any).$schema
  delete (schedulerConfig as any).$schema
  for (const fileMeta of eventCalendarConfig.files) {
    delete (fileMeta as any).content
  }
  for (const fileMeta of schedulerConfig.files) {
    delete (fileMeta as any).content
  }

  rootItems.push(eventCalendarConfig, schedulerConfig)
}

await writeFile(
  joinPaths(pkgDir, 'registry-dist', 'registry.json'),
  JSON.stringify({
    "$schema": "https://ui.shadcn.com/schema/registry.json",
    "name": 'fullcalendar',
    "homepage": "https://fullcalendar.io", // TODO: change to shadcn?
    "items": rootItems,
  }, undefined, 2),
  'utf-8',
)

async function createEventCalendarConfig(theme: string, themeTitle: string) {
  return {
    "$schema": "https://ui.shadcn.com/schema/registry-item.json",
    "name": `${theme}-event-calendar`,
    "title": `EventCalendar (${themeTitle})`,
    "description": `A standard event calendar in the ${themeTitle} theme-flavor`,
    "dependencies": [
      "@fullcalendar/react@^7.1.4",
      "lucide-react",
      "temporal-polyfill@^1.0.1"
    ],
    "registryDependencies": [
      "button",
      "tabs"
    ],
    "type": "registry:block",
    "files": [
      {
        "type": "registry:block",
        "path": "registry/blocks/event-calendar-demo.tsx", // fictional
        "content": transformSrcCode(
          await readFile(
            joinPaths(demoThemeDir, '_compiled', 'event-calendar-demo.tsx'),
            'utf-8',
          ),
        ),
      },
      {
        "type": "registry:component",
        "path": "registry/components/event-calendar.tsx", // fictional
        "content": transformSrcCode(
          await readFile(
            joinPaths(pkgDir, 'src', `theme-${theme}`, '_compiled', 'event-calendar.tsx'),
            'utf-8',
          ),
        ),
      },
      {
        "type": "registry:component",
        "path": "registry/components/event-calendar-toolbar.tsx", // fictional
        "content": transformSrcCode(
          await readFile(
            joinPaths(pkgDir, 'src', `theme-${theme}`, '_compiled', 'event-calendar-toolbar.tsx'),
            'utf-8',
          ),
        ),
      },
      {
        "type": "registry:component",
        "path": "registry/components/event-calendar-icons.tsx", // fictional
        "content": transformSrcCode(
          await readFile(
            joinPaths(pkgDir, 'src', `theme-${theme}`, '_compiled', 'event-calendar-icons.tsx'),
            'utf-8',
          ),
        ),
      },
      {
        "type": "registry:ui",
        "path": "registry/ui/event-calendar-views.tsx", // fictional
        "content": transformSrcCode(
          await readFile(
            joinPaths(pkgDir, 'src', `theme-${theme}`, '_compiled', 'event-calendar-views.tsx'),
            'utf-8',
          ),
        ),
      },
    ],
  }

}

async function createSchedulerConfig(theme: string, themeTitle: string) {
  return {
    "$schema": "https://ui.shadcn.com/schema/registry-item.json",
    "name": `${theme}-scheduler`,
    "title": `Scheduler (${themeTitle})`,
    "description": `A premium event scheduler in the ${themeTitle} theme-flavor`,
    "dependencies": [
      "@fullcalendar/react@^7.1.4",
      "@fullcalendar/react-scheduler@^7.1.4",
      "lucide-react",
      "temporal-polyfill@^1.0.1"
    ],
    "registryDependencies": [
      `@fullcalendar/${theme}-event-calendar`
    ],
    "type": "registry:block",
    "files": [
      {
        "type": "registry:block",
        "path": "registry/blocks/resource-timeline-demo.tsx", // fictional
        "content": transformSrcCode(
          await readFile(
            joinPaths(demoThemeDir, '_compiled', 'resource-timeline-demo.tsx'),
            'utf-8',
          ),
        ),
      },
      {
        "type": "registry:block",
        "path": "registry/blocks/resource-timegrid-demo.tsx", // fictional
        "content": transformSrcCode(
          await readFile(
            joinPaths(demoThemeDir, '_compiled', 'resource-timegrid-demo.tsx'),
            'utf-8',
          ),
        ),
      },
      {
        "type": "registry:component",
        "path": "registry/components/resource-timeline.tsx", // fictional
        "content": transformSrcCode(
          await readFile(
            joinPaths(pkgDir, 'src', `theme-${theme}`, '_compiled', 'resource-timeline.tsx'),
            'utf-8',
          ),
        ),
      },
      {
        "type": "registry:component",
        "path": "registry/components/resource-timegrid.tsx", // fictional
        "content": transformSrcCode(
          await readFile(
            joinPaths(pkgDir, 'src', `theme-${theme}`, '_compiled', 'resource-timegrid.tsx'),
            'utf-8',
          ),
        ),
      },
      {
        "type": "registry:ui",
        "path": "registry/ui/scheduler-views.tsx", // fictional
        "content": transformSrcCode(
          await readFile(
            joinPaths(pkgDir, 'src', `theme-${theme}`, '_compiled', 'scheduler-views.tsx'),
            'utf-8',
          ),
        ),
      }
    ],
  }
}

function transformSrcCode(code: string) {
  return code.replace(
    /import React from ['"]react['"];?\n/g,
    '',
  ).replace(
    /import React, \{/g,
    'import {',
  ).replace(
    /(from\s+['"])(\.[^'"]+)(['"])/g,
    (whole, pre, importPath, post) => {
      const replacement = relativeImportReplacements[importPath]
      if (replacement !== undefined) {
        return pre + replacement + post
      }
      return whole
    }
  )
}

function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
