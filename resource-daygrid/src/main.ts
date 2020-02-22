import { createPlugin } from '@fullcalendar/core'
import ResourceCommonPlugin from '@fullcalendar/resource-common'
import DayGridPlugin from '@fullcalendar/daygrid'
import ResourceDayGridView from './ResourceDayGridView'

export { ResourceDayGridView }
export { default as ResourceDayGrid, ResourceDayGridProps } from './ResourceDayGrid'

export default createPlugin({
  deps: [ ResourceCommonPlugin, DayGridPlugin ],
  defaultView: 'resourceDayGridDay',
  views: {

    resourceDayGrid: ResourceDayGridView,

    resourceDayGridDay: {
      type: 'resourceDayGrid',
      duration: { days: 1 }
    },

    resourceDayGridWeek: {
      type: 'resourceDayGrid',
      duration: { weeks: 1 }
    },

    resourceDayGridMonth: {
      type: 'resourceDayGrid',
      duration: { months: 1 },

      // TODO: wish we didn't have to C&P from dayGrid's file
      monthMode: true,
      fixedWeekCount: true
    }

  }
})
