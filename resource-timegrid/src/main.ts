import { createPlugin } from '@fullcalendar/core'
import ResourceCommonPlugin from '@fullcalendar/resource-common'
import TimeGridPlugin from '@fullcalendar/timegrid'
import ResourceTimeGridView from './ResourceTimeGridView'

export { ResourceTimeGridView }
export { default as ResourceTimeGrid, ResourceTimeGridProps } from './ResourceTimeGrid'

export default createPlugin({
  deps: [ ResourceCommonPlugin, TimeGridPlugin ],
  defaultView: 'resourceTimeGridDay',
  views: {

    resourceTimeGrid: {
      class: ResourceTimeGridView,

      // TODO: wish we didn't have to C&P from timeGrid's file
      allDaySlot: true,
      slotDuration: '00:30:00',
      slotEventOverlap: true // a bad name. confused with overlap/constraint system
    },

    resourceTimeGridDay: {
      type: 'resourceTimeGrid',
      duration: { days: 1 }
    },

    resourceTimeGridWeek: {
      type: 'resourceTimeGrid',
      duration: { weeks: 1 }
    }

  }
})
