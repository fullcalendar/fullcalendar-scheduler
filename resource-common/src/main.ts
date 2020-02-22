import { createPlugin } from '@fullcalendar/core'
import './ambient'
import { ResourceDataAdder, ResourceEventConfigAdder, transformIsDraggable } from './View' // TODO: ResourceDataAdder should be own plugin
import resourcesReducers from './reducers/resources'
import { parseEventDef } from './structs/event'
import { massageEventDragMutation, applyEventDefMutation, transformEventDrop } from './EventDragging'
import { transformDateSelectionJoin } from './DateSelecting'
import { transformDatePoint, transformDateSpan } from './Calendar'
import { isPropsValidWithResources } from './validation'
import { transformExternalDef } from './ExternalElementDragging'
import { transformEventResizeJoin } from './EventResizing'
import './api/EventApi'
import { injectLicenseWarning } from './license'
import optionChangeHandlers from './option-change-handlers'

// TODO: plugin-ify
import './resource-sources/resource-array'
import './resource-sources/resource-func'
import './resource-sources/resource-json-feed'

export default createPlugin({
  reducers: [ resourcesReducers ],
  eventDefParsers: [ parseEventDef ],
  isDraggableTransformers: [ transformIsDraggable ],
  eventDragMutationMassagers: [ massageEventDragMutation ],
  eventDefMutationAppliers: [ applyEventDefMutation ],
  dateSelectionTransformers: [ transformDateSelectionJoin ],
  datePointTransforms: [ transformDatePoint ],
  dateSpanTransforms: [ transformDateSpan ],
  viewPropsTransformers: [ ResourceDataAdder, ResourceEventConfigAdder ],
  isPropsValid: isPropsValidWithResources,
  externalDefTransforms: [ transformExternalDef ],
  eventResizeJoinTransforms: [ transformEventResizeJoin ],
  viewContainerModifiers: [ injectLicenseWarning ],
  eventDropTransformers: [ transformEventDrop ],
  optionChangeHandlers
})

export { default as ResourceDayHeader, ResourceDayHeaderProps } from './common/ResourceDayHeader'
export {
  VResourceJoiner, AbstractResourceDayTable, ResourceDayTable, DayResourceTable, VResourceSplitter,
  ResourceDayTableCell, ResourceIndex, VResourceProps
} from './common/resource-day-table'
export { Resource, ResourceHash, ResourceInput, getPublicId, parseResource } from './structs/resource'
export { ResourceViewProps, ResourceDataAdder, ResourceEventConfigAdder, transformIsDraggable } from './View'
export {
  flattenResources, Group, isGroupsEqual, GroupNode, ResourceNode, buildRowNodes, buildResourceFields
} from './common/resource-hierarchy'
export { buildResourceTextFunc } from './common/resource-rendering'
export { default as ResourceApi } from './api/ResourceApi'
export { default as ResourceSplitter, SplittableResourceProps } from './common/ResourceSplitter'
export { ResourceEntityExpansions, reduceResourceEntityExpansions } from './reducers/resourceEntityExpansions'
export { default as executeResourceSourceAction } from './reducers/resourceSource'
export { default as executeResourceStoreAction } from './reducers/resourceStore'
export { ResourceAction } from './reducers/resources'
export { ResourceFunc } from './resource-sources/resource-func'
export { parseEventDef } from './structs/event'
export {
  ExtendedResourceSourceInput, ResourceFetcher, ResourceSource, ResourceSourceDef, ResourceSourceError,
  ResourceSourceInput, doesSourceIgnoreRange, getResourceSourceDef, parseResourceSource, registerResourceSourceDef
} from './structs/resource-source'
export { transformDatePoint, transformDateSpan } from './Calendar'
export { transformDateSelectionJoin } from './DateSelecting'
export { applyEventDefMutation, computeResourceEditable, massageEventDragMutation, transformEventDrop } from './EventDragging'
export { transformEventResizeJoin } from './EventResizing'
export { transformExternalDef } from './ExternalElementDragging'
export { injectLicenseWarning } from './license'
export { isPropsValidWithResources } from './validation'
