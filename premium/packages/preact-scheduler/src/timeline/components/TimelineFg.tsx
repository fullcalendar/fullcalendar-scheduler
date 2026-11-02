import { joinClassNames } from '@fullcalendar/preact/public-api'
import {
  BaseComponent, memoize,
  getEventRangeMeta, DateMarker, DateRange, DateProfile, Dictionary, sortEventSegs,
  RefMap,
  afterSize,
  EventRangeProps,
  setRef,
  EventSegUiInteractionState,
  MeasuredHeightHarness,
  type Slice,
  getSliceKey,
} from '@fullcalendar/preact/protected-api'
import classNames from '@fullcalendar/preact/protected-styles'
import { type Ref } from 'react'
import { TimelineDateProfile } from '../timeline-date-profile'
import { TimelineRange } from '../TimelineLaneSlicer'
import { TimelineEvent } from './TimelineEvent'
import { TimelineLaneMoreLink } from './TimelineLaneMoreLink'
import {
  buildTimelineSegPlacements,
  buildTimelineSegSources,
  type TimelineSegMoreLink,
  type TimelineSourceSeg,
} from '../seg-placement-adapter'
import { resolveTimelineEventProjectionSizing } from '../slot-estimate'
import { computeSegHorizontals } from '../timeline-positioning'

export interface TimelineFgProps {
  dateProfile: DateProfile
  tDateProfile: TimelineDateProfile
  nowDate: DateMarker
  nowMs: number
  todayRange: DateRange

  // content
  fgEventSegs: (TimelineRange & EventRangeProps)[]
  eventDrag: EventSegUiInteractionState<TimelineRange> | null
  eventResize: EventSegUiInteractionState<TimelineRange> | null
  eventSelection: string
  dateSpanProps?: Dictionary // so can include a resource
  renderProps?: Dictionary // so can include a resource

  // a11y
  label?: string

  // dimensions
  slotWidth: number | undefined

  // virtualization (optional)
  clipStart?: number
  clipEnd?: number

  // ref
  heightRef?: Ref<number>
}

interface TimelineFgState {
  segHeightRev?: string
  moreLinkHeightRev?: string
}

export class TimelineFg extends BaseComponent<TimelineFgProps, TimelineFgState> {
  state = {} as TimelineFgState

  // memo
  private sortEventSegs = memoize(sortEventSegs)
  private buildSegSources = memoize(buildTimelineSegSources)

  // refs
  private sliceHeightRefMap = new RefMap<string, number>(() => { // keyed by slice part key
    afterSize(this.handleSegHeights)
  })
  private moreLinkHeightRefMap = new RefMap<string, number>(() => { // keyed by stable more-link key
    afterSize(this.handleMoreLinkHeights)
  })

  // internal
  private _isUnmounting: boolean
  private totalHeight?: number
  private totalHeightSettled?: boolean
  private firedTotalHeight?: number

  render() {
    let { props, context, sliceHeightRefMap, moreLinkHeightRefMap } = this
    let { options } = context
    let { tDateProfile } = props

    let mirrorSegs =
      (props.eventDrag ? props.eventDrag.segs : null) ||
      (props.eventResize ? props.eventResize.segs : null) ||
      []

    let fgSegs = this.sortEventSegs(props.fgEventSegs, options.eventOrder)
    const projectionSizing = resolveTimelineEventProjectionSizing(
      props.slotWidth,
      options.eventMinWidth,
    )
    let sourceSegs = this.buildSegSources(
      fgSegs,
      projectionSizing.eventMinWidth,
      context.dateEnv,
      tDateProfile,
      projectionSizing.slotWidth,
      props.clipStart,
      props.clipEnd,
    )
    let placementResult = buildTimelineSegPlacements(
      sourceSegs,
      options.eventOrderStrict,
      options.eventMaxStack,
      sliceHeightRefMap.current,
      moreLinkHeightRefMap.current,
    )

    this.totalHeight = placementResult.contentHeight
    /*
    An assumed slot width may paint, but it may not report a height upward. It would be wrong
    until the width is measured. An empty lane waits for the width too, which stops it from
    latching 0 before its events arrive.

    With virtualization, sourceSegs are only those within the horizontal clip, and the height is
    reported from them. A resource row fits the events on screen, and shrinks after scrolling
    past a tall stack, unlike without virtualization.
    */
    this.totalHeightSettled = props.slotWidth != null &&
      placementResult.isSettled

    const hasListItems = Boolean(
      placementResult.renderSlices.length || placementResult.moreLinks.length,
    )

    return (
      <div
        // events and more-links are list items. mirrors are aria-hidden
        {...(hasListItems ? { role: 'list', 'aria-label': props.label } : {})}
        className={joinClassNames(
          classNames.rel,
          classNames.noShrink,
        )}
        style={{
          height: placementResult.contentHeight,
        }}
      >
        {this.renderEventSlices(
          placementResult.renderSlices,
          placementResult.sliceCoords,
        )}
        {this.renderMirrorSegs(mirrorSegs, placementResult.sliceCoords)}
        {this.renderMoreLinks(placementResult.moreLinks)}
      </div>
    )
  }

  renderEventSlices(
    renderSlices: Slice<TimelineSourceSeg>[],
    sliceCoords: ReadonlyMap<string, number>,
  ) {
    const { props } = this

    return (
      <>
        {renderSlices.map((slice) => {
          const key = getSliceKey(slice)
          const seg = slice.sourceSeg
          const top = sliceCoords.get(key)
          const { eventRange } = seg
          const { instanceId } = eventRange.instance

          const isDragging = Boolean(props.eventDrag && props.eventDrag.affectedInstances[instanceId])
          const isResizing = Boolean(props.eventResize && props.eventResize.affectedInstances[instanceId])
          const isInvisible = isDragging || isResizing || top == null
          const isSelected = instanceId === props.eventSelection

          return (
            <MeasuredHeightHarness
              key={key}
              attrs={{ role: 'listitem' }}
              className={joinClassNames(
                classNames.abs,
                isSelected ? classNames.z1000 : classNames.z1,
              )}
              style={{
                visibility: isInvisible ? 'hidden' : undefined,
                top,
                insetInlineStart: slice.start,
                width: slice.end - slice.start,
              }}
              heightRef={this.sliceHeightRefMap.createRef(key)}
            >
              <TimelineEvent
                isTimeScale={props.tDateProfile.isTimeScale}
                eventRange={eventRange}
                isStart={seg.isStart}
                isEnd={seg.isEnd}
                isDragging={isDragging}
                isResizing={isResizing}
                isMirror={false}
                isSelected={isSelected}
                renderProps={props.renderProps}
                {...getEventRangeMeta(eventRange, props.todayRange, props.nowDate, props.nowMs)}
              />
            </MeasuredHeightHarness>
          )
        })}
      </>
    )
  }

  // Mirrors bypass normal-event admission so limits cannot hide them or create more links.
  renderMirrorSegs(
    segs: (TimelineRange & EventRangeProps)[],
    fgSegTops: ReadonlyMap<string, number>,
  ) {
    const { props, context } = this
    const projectionSizing = resolveTimelineEventProjectionSizing(
      props.slotWidth,
      context.options.eventMinWidth,
    )

    return segs.map((seg) => {
      const { eventRange } = seg
      const { instanceId } = eventRange.instance
      const horizontal = computeSegHorizontals(
        seg,
        projectionSizing.eventMinWidth,
        context.dateEnv,
        props.tDateProfile,
        projectionSizing.slotWidth,
        props.clipStart,
        props.clipEnd,
      )
      const isDragging = Boolean(props.eventDrag && props.eventDrag.affectedInstances[instanceId])
      const isResizing = Boolean(props.eventResize && props.eventResize.affectedInstances[instanceId])
      const isSelected = instanceId === props.eventSelection

      return (
        <MeasuredHeightHarness
          key={instanceId}
          attrs={{ 'aria-hidden': true }}
          className={joinClassNames(
            classNames.abs,
            isSelected ? classNames.z1000 : classNames.z1,
          )}
          style={{
            top: fgSegTops.get(instanceId) ?? 0,
            insetInlineStart: horizontal?.start,
            width: horizontal && horizontal.end - horizontal.start,
          }}
        >
          <TimelineEvent
            isTimeScale={props.tDateProfile.isTimeScale}
            eventRange={eventRange}
            isStart={seg.isStart}
            isEnd={seg.isEnd}
            isDragging={isDragging}
            isResizing={isResizing}
            isMirror
            isSelected={isSelected}
            renderProps={props.renderProps}
            {...getEventRangeMeta(eventRange, props.todayRange, props.nowDate, props.nowMs)}
          />
        </MeasuredHeightHarness>
      )
    })
  }

  renderMoreLinks(moreLinks: TimelineSegMoreLink[]) {
    const { props, moreLinkHeightRefMap } = this

    return (
      <>
        {moreLinks.map((moreLink) => (
          <MeasuredHeightHarness
            key={moreLink.key}
            attrs={{ role: 'listitem' }}
            className={classNames.abs}
            style={{
              top: moreLink.top,
              insetInlineStart: moreLink.start,
              width: moreLink.end - moreLink.start,
            }}
            heightRef={moreLinkHeightRefMap.createRef(moreLink.key)}
          >
            <TimelineLaneMoreLink
              hiddenSegs={moreLink.segs}
              dateProfile={props.dateProfile}
              nowDate={props.nowDate}
              nowMs={props.nowMs}
              todayRange={props.todayRange}
              isTimeScale={props.tDateProfile.isTimeScale}
              eventDrag={props.eventDrag}
              eventResize={props.eventResize}
              eventSelection={props.eventSelection}
              dateSpanProps={props.dateSpanProps}
              renderProps={props.renderProps}
            />
          </MeasuredHeightHarness>
        ))}
      </>
    )
  }

  private handleMoreLinkHeights = () => {
    if (this._isUnmounting) return
    this.setState({ moreLinkHeightRev: this.moreLinkHeightRefMap.rev }) // will trigger rerender
  }

  private handleSegHeights = () => {
    if (this._isUnmounting) return
    this.setState({ segHeightRev: this.sliceHeightRefMap.rev })
  }

  componentDidMount(): void {
    this._isUnmounting = false
    this.fireHeight() // could be ready to fire if zero events and zero height
  }

  componentDidUpdate(): void {
    this.fireHeight()
  }

  componentWillUnmount(): void {
    this._isUnmounting = true
    this.firedTotalHeight = undefined
    setRef(this.props.heightRef, null)
  }

  fireHeight() {
    if (
      this.totalHeightSettled &&
      this.totalHeight !== this.firedTotalHeight
    ) {
      this.firedTotalHeight = this.totalHeight
      setRef(this.props.heightRef, this.totalHeight)
    }
  }
}
