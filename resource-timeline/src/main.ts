import { createPlugin } from '@fullcalendar/core'
import TimelinePlugin from '@fullcalendar/timeline'
import ResourceCommonPlugin from '@fullcalendar/resource-common'
import ResourceTimelineView from './ResourceTimelineView'

export { ResourceTimelineView }
export { default as GroupRow, GroupRowProps } from './GroupRow'
export { clearExpanderIcon, updateExpanderIcon, updateTrResourceId } from './render-utils'
export { default as ResourceRow, ResourceRowProps } from './ResourceRow'
export { default as Row } from './Row'
export { default as Spreadsheet, SpreadsheetProps } from './Spreadsheet'
export { default as SpreadsheetHeader, SpreadsheetHeaderProps } from './SpreadsheetHeader'
export { default as SpreadsheetRow, SpreadsheetRowProps } from './SpreadsheetRow'

export default createPlugin({
  deps: [ ResourceCommonPlugin, TimelinePlugin ],
  defaultView: 'resourceTimelineDay',
  views: {

    resourceTimeline: {
      class: ResourceTimelineView,
      resourceAreaWidth: '30%',
      resourcesInitiallyExpanded: true,
      eventResizableFromStart: true // TODO: not DRY with this same setting in the main timeline config
    },

    resourceTimelineDay: {
      type: 'resourceTimeline',
      duration: { days: 1 }
    },

    resourceTimelineWeek: {
      type: 'resourceTimeline',
      duration: { weeks: 1 }
    },

    resourceTimelineMonth: {
      type: 'resourceTimeline',
      duration: { months: 1 }
    },

    resourceTimelineYear: {
      type: 'resourceTimeline',
      duration: { years: 1 }
    }

  }
})
