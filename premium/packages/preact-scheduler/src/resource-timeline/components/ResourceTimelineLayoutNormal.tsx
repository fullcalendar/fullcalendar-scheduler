import { Duration, joinClassNames } from '@fullcalendar/preact/public-api'
import {
  afterSize,
  DateComponent,
  DateMarker,
  DateProfile,
  DateRange,
  EventStore,
  getIsHeightAuto,
  getFooterScrollbarSticky,
  getTableHeaderSticky,
  Hit,
  memoize,
  RefMap,
  Ruler,
  Scroller,
  ScrollerSyncerInterface,
  setRef,
  SlicedProps,
  SplittableProps,
  FooterScrollbar,
  ViewContainer,
  generateClassName,
  debounce,
  computeViewBorderless,
} from '@fullcalendar/preact/protected-api'
import classNames from '@fullcalendar/preact/protected-styles'
import { createRef, type Ref } from 'react'
import { createEntityId, createGroupId, GenericNode, Group, isEntityGroup } from '../../resource/common/resource-hierarchy'
import { Resource } from '../../resource/structs/resource'
import { ResourceEntityExpansions } from '../../resource/reducers/resourceEntityExpansions'
import { ScrollerSyncer } from '../../scrollgrid/ScrollerSyncer'
import { getTimelineSlotEl } from '../../timeline/components/util'
import { TimelineDateProfile, TimelineHeaderCellData, isNowInTimelineRange } from '../../timeline/timeline-date-profile'
import { TimelineHeaderRow } from '../../timeline/components/TimelineHeaderRow'
import { TimelineBg } from '../../timeline/components/TimelineBg'
import { TimelineNowIndicatorArrow } from '../../timeline/components/TimelineNowIndicatorArrow'
import { TimelineNowIndicatorLine } from '../../timeline/components/TimelineNowIndicatorLine'
import { TimelineRange } from '../../timeline/TimelineLaneSlicer'
import { TimelineSlats } from '../../timeline/components/TimelineSlats'
import { computeTimelineHitData, timeToCoord } from '../../timeline/timeline-positioning'
import { ESTIMATED_SLOT_WIDTH } from '../../timeline/slot-estimate'
import { computeHeights, computeTopsFromHeights, DimConfig, findEntityByCoord } from '@full-ui/headless-grid'
import {
  buildResourceLayouts,
  GenericLayout,
  GroupCellLayout,
  GroupRowLayout,
  ResourceRowLayout,
  RowLayout,
} from '../resource-layout'
import { ColSpec } from '../structs'
import { GroupLane } from './lane/GroupLane'
import { ResourceLane } from './lane/ResourceLane'
import { ResizableTwoCol } from './ResizableTwoCol'
import { BodySection } from './spreadsheet/BodySection'
import { HeaderCells } from './spreadsheet/HeaderCells'
import { SuperHeaderCell } from './spreadsheet/SuperHeaderCell'
import { computeShift, type ItemPosition, Virtualizer } from '../virtual/virtualizer'
import { AriaProxyRows, buildAriaBodyRows, buildAriaCellAttrs, getAriaTableRole } from '../aria'
import { computeResourceTimelineHeaderHeight } from '../header-height'

interface ResourceTimelineLayoutNormalProps {
  className?: string
  labelId: string | undefined
  labelStr: string | undefined

  tDateProfile: TimelineDateProfile
  dateProfile: DateProfile
  resourceHierarchy: GenericNode[]
  resourceEntityExpansions: ResourceEntityExpansions
  hasNesting: boolean

  nowDate: DateMarker
  nowMs: number // exact instant of nowDate
  todayRange: DateRange

  colSpecs: ColSpec[]
  groupColCnt: number
  superHeaderRendering: any

  splitProps: { [key: string]: SplittableProps }
  bgSlicedProps: SlicedProps<TimelineRange>
  eventSelection: string | undefined | null // HACK for EventDragging::handlePointerDown

  hasResourceBusinessHours: boolean
  fallbackBusinessHours: EventStore

  slotWidth: number | undefined
  slotLiquid: boolean
  timeCanvasWidth: number | undefined
  spreadsheetColWidths: number[] | undefined
  spreadsheetCanvasWidth: number | undefined
  indentWidth: number | undefined

  spreadsheetClientWidthRef?: Ref<number>
  timeClientWidthRef: Ref<number>
  slotInnerWidthRef: Ref<number>

  // handlers
  onColResize?: (colIndex: number, newWidth: number) => void

  // resource area
  initialSpreadsheetWidthConfig: DimConfig
  spreadsheetResizedWidthConfigRef?: Ref<DimConfig>

  // scroll
  initialScroll?: TimeScroll & EntityScroll
  scrollRef?: Ref<TimeScroll & EntityScroll>
}

export interface EntityScroll {
  entityId?: string
  fromBottom?: number
}

export interface TimeScroll {
  time?: Duration
  x?: number
}

interface ResourceTimelineViewState {
  spreadsheetBottomScrollbarWidth?: number

  timeTotalWidth?: number
  timeClientHeight?: number
  timeClientWidth?: number
  timeEndScrollbarWidth?: number
  timeBottomScrollbarWidth?: number
}

const defaultOwnCellHeight = 40

export class ResourceTimelineLayoutNormal extends DateComponent<ResourceTimelineLayoutNormalProps, ResourceTimelineViewState> {
  state = {} as ResourceTimelineViewState

  // memoized
  private buildResourceLayouts = memoize(buildResourceLayouts)

  // amount of extra space that should be temporarily added to vertical rows
  // after setting, must call forceUpdate
  // only supported for bodyScroller (aka getIsHeightAuto()===false)
  private scrollSlack = 0

  private queuedEntityScroll = false

  private _isUnmounting: boolean

  // A row is as tall as its taller cell, so a cell's change in height is not the row's. An empty
  // lane, for example, is much shorter than its row, and has no effect on the row's height
  handleSpreadsheetCellHeightChange = (val: number, key: string, oldVal: number | null) => {
    const timeHeight = this.timeEntityInnerHeightMap.current.get(key) || 0

    this.handleBodyRowHeightChange(
      key,
      Math.max(oldVal ?? defaultOwnCellHeight, timeHeight),
      Math.max(val, timeHeight),
    )
  }

  handleTimeCellHeightChange = (val: number, key: string, oldVal: number | null) => {
    const spreadsheetHeight = this.dataGridEntityInnerHeightMap.current.get(key) ?? defaultOwnCellHeight

    this.handleBodyRowHeightChange(
      key,
      Math.max(spreadsheetHeight, oldVal || 0),
      Math.max(spreadsheetHeight, val),
    )
  }

  // This is a means to recompute row positioning when *HeightMaps change
  handleBodyRowHeightChange = (key: string, oldHeight: number, newHeight: number) => {
    if (this._isUnmounting) return

    if (this.isScrolling) {
      const scrollSlackDelta = oldHeight - newHeight
      if (scrollSlackDelta) {
        const topCoord = this.bodyTops.get(key)
        // Live scroll position, because currentEntityScroll lags when the browser clamps the
        // scroll after content shrinks, and its scroll event hasn't fired yet
        if (topCoord != null && topCoord < this.bodyScroller.y) {
          if (!getIsHeightAuto(this.context.options)) {
            // console.log('DELTA', key, oldHeight, '->', newHeight)
            this.scrollSlack += scrollSlackDelta
          }
        }
      }
    } else {
      this.queuedEntityScroll = true
    }

    afterSize(this.boundForceUpdate)
  }

  handleHeaderRowHeightChange = () => {
    if (this._isUnmounting) return
    afterSize(this.boundForceUpdate)
  }

  boundForceUpdate = () => {
    if (this._isUnmounting) return
    this.forceUpdate()
  }

  // refs
  private bodyEl: HTMLElement
  private spreadsheetHeaderScrollerRef = createRef<Scroller>()
  private spreadsheetBodyScrollerRef = createRef<Scroller>()
  private spreadsheetFooterScrollerRef = createRef<Scroller>()
  private timeHeaderScrollerRef = createRef<Scroller>()
  private timeBodyScrollerRef = createRef<Scroller>()
  private timeFooterScrollerRef = createRef<Scroller>()
  private headerRowInnerWidthMap = new RefMap<number, number>(() => { // just for timeline-header
    afterSize(this.handleSlotInnerWidths)
  })

  // TODO: give simpler handlers to this???
  private timelineHeaderRowInnerHeightMap = new RefMap<number, number>(this.handleHeaderRowHeightChange)
  private dataGridHeaderRowInnerHeightMap = new RefMap<boolean, number>(this.handleHeaderRowHeightChange)

  // keyed by createEntityId
  // NOTE: ignoring deletes can cause memory issues if resources constantly change and have new keys
  // refactor in future. FWIW, TanStack Virtual doesn't garbage collect unnused dimensions either
  private dataGridEntityInnerHeightMap = new RefMap<string, number>(this.handleSpreadsheetCellHeightChange, /* ignoreDeletes = */ true)
  private timeEntityInnerHeightMap = new RefMap<string, number>(this.handleTimeCellHeightChange, /* ignoreDeletes = */ true)

  private bodyLayouts: GenericLayout<Resource | Group>[]
  private bodyTops?: Map<string, number> // keyed by createEntityId
  private bodyHeights?: Map<string, number> // keyed by createEntityId

  // internal
  private slotInnerWidth?: number
  private timeScroller: ScrollerSyncerInterface
  private bodyScroller: ScrollerSyncerInterface
  private spreadsheetScroller: ScrollerSyncerInterface
  private maxVScroll: number | undefined
  private maxHScroll: number | undefined

  // updated in-place
  // .time takes precedence
  // to operate on pixel value (.x), clear time
  private scroll: EntityScroll & TimeScroll = {}

  // virtualizers
  private getEntityTop = (key) => this.bodyTops.get(key)
  private getEntityHeight = (key) => this.bodyHeights.get(key)
  private rowVirtualizer = new Virtualizer<RowLayout>(
    (rowLayout) => createEntityId(rowLayout.entity),
    this.getEntityTop,
    this.getEntityHeight,
    this.boundForceUpdate,
  )
  private groupColVirtualizers: Virtualizer<GroupCellLayout>[] = []
  private slotVirtualizer = new Virtualizer<string>(
    (slotKey) => slotKey,
    (_key, index) => index * (this.props.slotWidth ?? ESTIMATED_SLOT_WIDTH),
    () => this.props.slotWidth ?? ESTIMATED_SLOT_WIDTH,
    this.boundForceUpdate,
    /* overscan = */ 3,
  )
  private timeHeaderVirtualizers: Virtualizer<TimelineHeaderCellData>[] = []

  render() {
    let { props, state, context } = this
    let { dateProfile, hasNesting } = props
    let { options, viewSpec } = context
    const { borderlessX, borderlessTop, borderlessBottom } = computeViewBorderless(options)
    let { spreadsheetBottomScrollbarWidth, timeTotalWidth, timeClientWidth, timeClientHeight, timeBottomScrollbarWidth } = state

    /* date */

    const { tDateProfile } = props
    let { cellRows } = tDateProfile

    /* table settings */

    let allowVerticalScrolling = !getIsHeightAuto(options)
    let tableHeaderSticky = getTableHeaderSticky(options)
    let footerScrollbarSticky = getFooterScrollbarSticky(options)

    const { colSpecs, groupColCnt, superHeaderRendering } = props

    /* table hierarchy */

    const { resourceHierarchy } = props

    const superHeaderRowSpan = superHeaderRendering ? 1 : 0
    const totalHeaderRowSpan = superHeaderRowSpan + 1

    /* table display */

    let {
      layouts: bodyLayouts,
      flatRowLayouts,
      flatGroupColLayouts,
      totalCnt,
    } = this.buildResourceLayouts(
      resourceHierarchy,
      hasNesting,
      props.resourceEntityExpansions,
      options.resourcesInitiallyExpanded,
    )
    this.bodyLayouts = bodyLayouts

    // update groupColVirtualizers
    let groupColVirtualizers = this.groupColVirtualizers
    let oldLen = groupColVirtualizers.length
    let newLen = flatGroupColLayouts.length
    if (newLen > oldLen) {
      for (let i = oldLen; i < newLen; i++) {
        groupColVirtualizers[i] = new Virtualizer<GroupCellLayout>(
          (groupCellLayout) => createGroupId(groupCellLayout.entity),
          this.getEntityTop,
          this.getEntityHeight,
          this.boundForceUpdate,
        )
      }
    } else if (newLen < oldLen) {
      groupColVirtualizers = groupColVirtualizers.slice(0, newLen)
    }
    this.groupColVirtualizers = groupColVirtualizers

    // update timeHeaderVirtualizers
    let timeHeaderVirtualizers = this.timeHeaderVirtualizers
    oldLen = timeHeaderVirtualizers.length
    newLen = cellRows.length
    if (newLen > oldLen) {
      for (let i = oldLen; i < newLen; i++) {
        timeHeaderVirtualizers[i] = new Virtualizer<TimelineHeaderCellData>(
          (cell) => cell.key,
          undefined, // getItemStart (let Virtualizer compute it)
          (key, index, cell) => cell.colspan * (this.props.slotWidth ?? ESTIMATED_SLOT_WIDTH),
          this.boundForceUpdate,
        )
        // HACK to prepopulate
        timeHeaderVirtualizers[i].viewportSize = timeHeaderVirtualizers[0].viewportSize
        timeHeaderVirtualizers[i].scroll = timeHeaderVirtualizers[0].scroll
      }
    }
    this.timeHeaderVirtualizers = timeHeaderVirtualizers

    // Expansion-filtered rows, including those outside the virtualized viewport.
    // `totalCnt` also includes collapsed descendants; `rowPositions` below is the mounted subset.
    const displayedRowCnt = flatRowLayouts.length

    /* table positions */

    // does not include bottom border between header and body
    const headerHeight = computeResourceTimelineHeaderHeight(
      this.dataGridHeaderRowInnerHeightMap.current,
      this.timelineHeaderRowInnerHeightMap.current,
      Boolean(superHeaderRendering),
      tDateProfile.cellRows.length,
    )

    let endScrollbarWidth = (timeTotalWidth != null && timeClientWidth != null)
      ? timeTotalWidth - timeClientWidth
      : undefined

    // totalBodyHeight is the height WITHIN the scrollers
    let [bodyHeights, totalBodyHeight] = computeHeights( // TODO: memoize?
      bodyLayouts,
      createEntityId,
      (entityKey) => { // makes memoization impossible!
        const entitySpreadsheetHeight = this.dataGridEntityInnerHeightMap.current.get(entityKey) ?? defaultOwnCellHeight

        // map doesn't contain group-column-cell heights, thus ||0
        // TODO: better use defaultOwnCellHeight
        const entityTimeHeight = this.timeEntityInnerHeightMap.current.get(entityKey) || 0

        return Math.max(entitySpreadsheetHeight, entityTimeHeight)
      },
      /* minHeight = */ (allowVerticalScrolling && options.expandRows)
        ? timeClientHeight
        : undefined,
    )
    this.bodyHeights = bodyHeights

    let bodyTops = computeTopsFromHeights(bodyLayouts, createEntityId, bodyHeights, this.scrollSlack)
    this.bodyTops = bodyTops

    /* virtualize */

    const virtualizationDisabled = !options.virtualization

    // ensure in-range items are computed with most recent scroll, even tho maybe not applied yet
    const forcedEntityScroll = this.computeEntityScroll()

    const rowPositions = this.rowVirtualizer.computePositions(flatRowLayouts, virtualizationDisabled, forcedEntityScroll)

    // Keep render loops component-type-specific for future row recycling.
    const groupRowPositions: ItemPosition<GroupRowLayout>[] = []
    const resourceRowPositions: ItemPosition<ResourceRowLayout>[] = []

    for (const rowPosition of rowPositions) {
      if ('resourceFields' in rowPosition.item) {
        resourceRowPositions.push(rowPosition as ItemPosition<ResourceRowLayout>)
      } else {
        groupRowPositions.push(rowPosition as ItemPosition<GroupRowLayout>)
      }
    }

    const groupColPositions = this.groupColVirtualizers.map((groupColVirtualizer, i) => {
      return groupColVirtualizer.computePositions(flatGroupColLayouts[i], virtualizationDisabled, forcedEntityScroll)
    })

    // Scope deterministic row/column cell IDs to this calendar instance.
    const cellIdPrefix = `${context.baseId}rt`
    const ariaBodyRows = buildAriaBodyRows(
      flatRowLayouts,
      groupColPositions,
      rowPositions,
      groupColCnt,
      colSpecs.length,
    )

    // Only paint vertical fills/lines that are in view
    // Big performance impact for very tall virtualized lists
    // NOTE: could be zero rows and groups!
    const rowPositionShift = computeShift(rowPositions)
    const yFillTop = rowPositionShift?.[0] ?? 0
    const yFillBottom = rowPositionShift?.[1] ?? 0

    let yFillHeight: number

    if (allowVerticalScrolling) {
      yFillHeight = timeClientHeight != null
        ? Math.max(yFillBottom, timeClientHeight) - yFillTop
        : undefined
    } else {
      yFillHeight = yFillBottom - yFillTop
    }

    // Uses the same slot geometry as slotVirtualizer, which is estimated until measured.
    // When the canvas fits without scrolling, scrollTo() is a no-op that fires no scroll event,
    // so an uncapped time-based scroll would linger and the virtualizer would skip the leading
    // slots (#8093)
    this.maxHScroll = timeClientWidth != null
      ? Math.max(0, tDateProfile.slotCnt * (props.slotWidth ?? ESTIMATED_SLOT_WIDTH) - timeClientWidth)
      : undefined

    const forcedTimeScroll = this.computeTimeScroll()
    const slotDatePositions = this.slotVirtualizer.computePositions(tDateProfile.slotKeys, virtualizationDisabled, forcedTimeScroll)
    const slotDateShift = computeShift(slotDatePositions)

    /* */

    const { timeCanvasWidth } = props
    const slotWidth = props.slotWidth ?? ESTIMATED_SLOT_WIDTH

    const { spreadsheetColWidths, spreadsheetCanvasWidth } = props

    /* event display */

    const { splitProps, bgSlicedProps } = props

    /* business hour display */

    const { hasResourceBusinessHours, fallbackBusinessHours } = props

    const enableNowIndicator = // TODO: DRY
      options.nowIndicator &&
      isNowInTimelineRange(props.nowDate, props.dateProfile, props.tDateProfile)

    /* filler */

    const spreadsheetBottomFiller = Math.max(
      0,
      (timeBottomScrollbarWidth || 0) -
        (spreadsheetBottomScrollbarWidth || 0),
    )

    const timelineBottomFiller = Math.max(
      0,
      (spreadsheetBottomScrollbarWidth || 0) -
        (timeBottomScrollbarWidth || 0),
    )

    const maxVScroll = this.maxVScroll =
      (allowVerticalScrolling && timeClientHeight != null)
        ? Math.max(0, totalBodyHeight - timeClientHeight)
        : 0

    const allowBottomFiller =
      !options.expandRows && // if rows expand, then we never need filler
      !maxVScroll // no scrolling possible

    const spreadsheetNeedsBottomFiller = allowBottomFiller || Boolean(spreadsheetBottomFiller)
    const timelineNeedsBottomFiller = allowBottomFiller || Boolean(timelineBottomFiller)

    return (
      <ViewContainer
        viewSpec={viewSpec}
        attrs={{
          role: getAriaTableRole(hasNesting),
          'aria-rowcount': totalHeaderRowSpan + totalCnt,
          'aria-colcount': colSpecs.length + 1,
          'aria-label': props.labelStr,
          'aria-labelledby': props.labelId,
        }}
        className={joinClassNames(
          props.className,
          generateClassName(options.tableClass, {
            borderlessX,
            borderlessTop,
            borderlessBottom,
            multiMonthColumns: 0,
          }),
          classNames.flexCol,
        )}
      >
        <AriaProxyRows
          cellIdPrefix={cellIdPrefix}
          bodyRows={ariaBodyRows}
          resourceColCnt={colSpecs.length}
          superHeaderRowSpan={superHeaderRowSpan}
          hasNesting={hasNesting}
        />
        <ResizableTwoCol
          initialStartWidthConfig={props.initialSpreadsheetWidthConfig}
          resizedWidthConfigRef={props.spreadsheetResizedWidthConfigRef}
          className={allowVerticalScrolling ? classNames.liquid : ''}

          /* spreadsheet
          --------------------------------------------------------------------------------- */

          startClassName={joinClassNames(classNames.flexCol, classNames.isolate)}
          startContent={
            <>

              {/* spreadsheet HEADER
              ---------------------------------------------------------------------------- */}
              <div
                role="presentation"
                className={joinClassNames(
                  generateClassName(options.tableHeaderClass, {
                    isSticky: tableHeaderSticky,
                    borderlessX,
                    borderlessTop,
                    borderlessBottom,
                    multiMonthColumns: 0,
                  }),
                  classNames.flexCol,
                  tableHeaderSticky && classNames.tableHeaderSticky,
                  classNames.z1,
                )}
              >
                <div
                  className={joinClassNames(
                    classNames.flexCol,
                    classNames.contentBox,
                  )}
                  style={{
                    height: headerHeight,
                  }}
                >
                  {Boolean(superHeaderRendering) && (
                    <div
                      role="presentation"
                      className={joinClassNames(
                        options.resourceHeaderRowClass,
                        classNames.flexRow,
                        classNames.grow,
                        classNames.borderlessX,
                        classNames.borderlessTop,
                      )}
                    >
                      <SuperHeaderCell
                        cellIdPrefix={cellIdPrefix}
                        cellRowIndex={1}
                        cellColIndex={0}
                        renderHooks={superHeaderRendering}
                        indent={hasNesting && !groupColCnt /* group-cols are leftmost, making expander alignment irrelevant */}
                        innerHeightRef={this.dataGridHeaderRowInnerHeightMap.createRef(true)}
                        colSpan={colSpecs.length}
                        indentWidth={props.indentWidth}
                      />
                    </div>
                  )}
                  <Scroller
                    horizontal
                    hideScrollbars
                    className={joinClassNames(classNames.flexCol, classNames.grow)}
                    ref={this.spreadsheetHeaderScrollerRef}
                  >
                    <div
                      className={joinClassNames(classNames.flexCol, classNames.grow)}
                      style={{ minWidth: spreadsheetCanvasWidth }}
                    >
                      <div
                        role="presentation"
                        className={joinClassNames(
                          options.resourceHeaderRowClass,
                          classNames.flexRow,
                          classNames.grow,
                          classNames.borderless,
                        )}
                      >
                        <HeaderCells
                          colSpecs={colSpecs}
                          colWidths={spreadsheetColWidths}
                          indent={hasNesting}
                          indentWidth={props.indentWidth}
                          rowIndex={superHeaderRowSpan}
                          cellIdPrefix={cellIdPrefix}

                          // refs
                          innerHeightRef={this.dataGridHeaderRowInnerHeightMap.createRef(false)}
                          onColResize={props.onColResize}
                        />
                      </div>
                    </div>
                  </Scroller>
                </div>
                <div
                  className={generateClassName(options.slotHeaderDividerClass, {
                    inTableHeader: true,
                    options: { dayMinWidth: options.dayMinWidth },
                  })}
                />
              </div>

              {/* spreadsheet BODY
              ---------------------------------------------------------------------------- */}
              <Scroller
                vertical={allowVerticalScrolling}
                horizontal
                hideScrollbars
                className={joinClassNames(
                  generateClassName(options.tableBodyClass, {
                    borderlessX,
                    borderlessTop,
                    borderlessBottom,
                    multiMonthColumns: 0,
                  }),
                  classNames.flexCol,
                  classNames.rel, // for Ruler.fillStart
                  allowVerticalScrolling && classNames.liquid,
                  classNames.z0,
                )}
                ref={this.spreadsheetBodyScrollerRef}
                clientWidthRef={this.handleSpreadsheetClientWidth}
              >
                <BodySection
                  cellIdPrefix={cellIdPrefix}
                  inTreeGrid={hasNesting}
                  groupRowPositions={groupRowPositions}
                  resourceRowPositions={resourceRowPositions}
                  groupColPositions={groupColPositions}
                  displayedRowCnt={displayedRowCnt}
                  groupCellCnts={flatGroupColLayouts.map((flatGroupCellLayouts) => flatGroupCellLayouts.length)}
                  colWidths={spreadsheetColWidths}
                  colSpecs={colSpecs}
                  rowInnerHeightRefMap={this.dataGridEntityInnerHeightMap}
                  headerRowSpan={totalHeaderRowSpan}
                  indentWidth={props.indentWidth}
                  canvasWidth={spreadsheetCanvasWidth}
                  canvasHeight={totalBodyHeight}
                />
                {spreadsheetNeedsBottomFiller && (
                  <div
                    className={joinClassNames(
                      generateClassName(options.fillerClass, { inTableHeader: false }),
                      classNames.borderlessX,
                      classNames.borderlessBottom,
                    )}
                    style={{ minHeight: spreadsheetBottomFiller }}
                  />
                )}
              </Scroller>

              {/* spreadsheet FOOTER scrollbar
              ----------------------------------------------------------------------------
              Not just for footerScrollbarSticky:true,
              also just for normal horizontal scrolling,
              because we need to hide the vertical scrollbar, but can't solely show the horizontal one
              */}
              <FooterScrollbar
                isSticky={footerScrollbarSticky}
                canvasWidth={spreadsheetCanvasWidth}
                scrollerRef={this.spreadsheetFooterScrollerRef}
                scrollbarWidthRef={this.handleSpreadsheetBottomScrollbarWidth}
              />
            </>
          }

          /* time-area (TODO: try to make this DRY-er with TimelineView???)
          --------------------------------------------------------------------------------- */

          endClassName={joinClassNames(classNames.flexCol, classNames.isolate)}
          endContent={
            <>

              {/* time-area HEADER
              ---------------------------------------------------------------------------- */}
              <div
                className={joinClassNames(
                  generateClassName(options.tableHeaderClass, {
                    isSticky: tableHeaderSticky,
                    borderlessX,
                    borderlessTop,
                    borderlessBottom,
                    multiMonthColumns: 0,
                  }),
                  classNames.flexCol,
                  tableHeaderSticky && classNames.tableHeaderSticky,
                  classNames.z1,
                )}
              >
                <Scroller
                  ref={this.timeHeaderScrollerRef}
                  horizontal
                  hideScrollbars
                  className={joinClassNames(
                    classNames.flexRow,
                    classNames.contentBox,
                  )}
                  style={{
                    height: headerHeight,
                  }}
                >
                  {/* for screen reader users. zero-height */}
                  <div role="presentation">
                    <div
                      {...buildAriaCellAttrs({
                        cellIdPrefix,
                        cellRowIndex: 1,
                        cellColIndex: colSpecs.length,
                      })}
                      role="columnheader"
                      aria-rowspan={totalHeaderRowSpan}
                      className={classNames.srOnly}
                    >
                      {options.eventsHint}
                    </div>
                  </div>

                  {/* for sighted users */}
                  <div // the canvas
                    aria-hidden
                    className={joinClassNames( // TODO: DRY
                      classNames.rel, // origin for now-indicator
                      classNames.flexCol,
                      timeCanvasWidth == null && classNames.liquid,

                      // slotLiquid:true implies that slots are expanding bigger than their min,
                      // and that there are NOT any horizontal scrollbars. if so, then no worries
                      // about sticky-event-titles. if so, we're able to apply cropping to prevent
                      // event hover-resizers and whatnot from bleeding out of the canvas and causing
                      // horizontal scrollbars when there normally wouldn't be any
                      props.slotLiquid && classNames.crop,
                    )}
                    style={{ minWidth: timeCanvasWidth }}
                  >
                    {cellRows.map((cells, rowIndex) => {
                      const rowLevel = cellRows.length - rowIndex - 1

                      const headerCellPositions = timeHeaderVirtualizers[rowIndex].computePositions(cells, virtualizationDisabled, forcedTimeScroll)
                      const shift = computeShift(headerCellPositions)
                      if (shift) {
                        timeHeaderVirtualizers[rowIndex].computePositions(cells, virtualizationDisabled, forcedTimeScroll)
                      }

                      return (
                        <TimelineHeaderRow
                          key={rowIndex}
                          className={joinClassNames(classNames.rel, classNames.grow)}
                          dateProfile={props.dateProfile}
                          tDateProfile={tDateProfile}
                          nowDate={props.nowDate}
                          nowMs={props.nowMs}
                          todayRange={props.todayRange}
                          rowLevel={rowLevel}
                          cells={cells}
                          slotWidth={slotWidth}
                          innerWidthRef={this.headerRowInnerWidthMap.createRef(rowIndex)}
                          innerHeighRef={this.timelineHeaderRowInnerHeightMap.createRef(rowIndex)}
                          insetInlineStart={shift && shift[0]}
                          width={shift ? (shift[1] - shift[0]) : undefined}
                          cellStartIndex={shift && shift[2]}
                          cellCount={headerCellPositions.length}
                        />
                      )
                    })}
                    {enableNowIndicator && (
                      // TODO: make this positioned WITHIN padding
                      <TimelineNowIndicatorArrow
                        tDateProfile={tDateProfile}
                        nowMs={props.nowMs}
                        slotWidth={slotWidth}
                      />
                    )}
                  </div>

                  {Boolean(endScrollbarWidth) && (
                    <div
                      className={joinClassNames(
                        generateClassName(options.fillerClass, { inTableHeader: true }),
                        classNames.borderlessY,
                        classNames.borderlessEnd,
                      )}
                      style={{ minWidth: endScrollbarWidth }}
                    />
                  )}
                </Scroller>
                <div
                  className={generateClassName(options.slotHeaderDividerClass, {
                    inTableHeader: false,
                    options: { dayMinWidth: options.dayMinWidth },
                  })}
                />
              </div>

              {/* time-area BODY (w/ events)
              ---------------------------------------------------------------------------- */}
              <Scroller
                vertical={
                  allowVerticalScrolling &&
                  // infer whether scrolling would happen. prevents clientHeight thrashing due to horizontal scrollbars
                  (totalBodyHeight != null && timeClientHeight != null && totalBodyHeight > timeClientHeight)
                }
                horizontal
                hideScrollbars={footerScrollbarSticky /* FYI, this view is never print */}
                className={joinClassNames(
                  generateClassName(options.tableBodyClass, {
                    borderlessX,
                    borderlessTop,
                    borderlessBottom,
                    multiMonthColumns: 0,
                  }),
                  classNames.flexCol,
                  classNames.rel, // for Ruler.fillStart
                  allowVerticalScrolling && classNames.liquid,
                  classNames.z0,
                )}
                ref={this.timeBodyScrollerRef}
                clientWidthRef={this.handleTimeClientWidth}
                clientHeightRef={
                  allowVerticalScrolling
                    ? this.handleTimeClientHeight
                    : undefined // for when height:auto, which will have dynamic height and needlessly fire ResizeObserver
                }
                bottomScrollbarWidthRef={
                  allowVerticalScrolling
                    ? this.handleTimeBottomScrollbarWidth
                    : undefined // for when height:auto, which will have dynamic height and needlessly fire ResizeObserver
                }
              >
                <div // canvas that expands to height of scroller (at least)
                  className={joinClassNames(
                    classNames.rel, // origin for canvas?
                    classNames.grow,
                    classNames.flexCol,

                    // slotLiquid:true implies that slots are expanding bigger than their min,
                    // and that there are NOT any horizontal scrollbars. if so, then no worries
                    // about sticky-event-titles. if so, we're able to apply cropping to prevent
                    // event hover-resizers and whatnot from bleeding out of the canvas and causing
                    // horizontal scrollbars when there normally wouldn't be any
                    props.slotLiquid && classNames.crop,
                  )}
                  style={{
                    minWidth: timeCanvasWidth,
                    minHeight: totalBodyHeight,
                  }}
                  ref={this.handleBodyEl}
                >
                  <div
                    // roving-origin for anything that fills y-axis,
                    // like slots or non-resource bg events
                    // is ZERO-width, but has defined top/bottom
                    className={classNames.abs}
                    style={{
                      top: yFillTop,
                      height: yFillHeight,
                      bottom: yFillHeight == null ? 0 : undefined,
                      insetInlineStart: slotDateShift?.[0],
                    }}
                  >
                    <TimelineSlats
                      dateProfile={dateProfile}
                      tDateProfile={tDateProfile}
                      nowDate={props.nowDate}
                      nowMs={props.nowMs}
                      todayRange={props.todayRange}
                      slatStartIndex={slotDateShift?.[2]}
                      slatCount={slotDatePositions.length}
                      slotWidth={slotWidth}
                    />
                    <TimelineBg
                      tDateProfile={tDateProfile}
                      nowDate={props.nowDate}
                      nowMs={props.nowMs}
                      todayRange={props.todayRange}

                      // content
                      bgEventSegs={bgSlicedProps.bgEventSegs}
                      businessHourSegs={hasResourceBusinessHours ? null : bgSlicedProps.businessHourSegs}
                      dateSelectionSegs={bgSlicedProps.dateSelectionSegs}
                      eventResizeSegs={(bgSlicedProps.eventResize ? bgSlicedProps.eventResize.segs : null)}

                      // dimensions
                      slotWidth={props.slotWidth}

                      // virtualization
                      clipStart={slotDateShift?.[0]}
                      clipEnd={slotDateShift?.[1]}
                    />
                    {enableNowIndicator && (
                      <TimelineNowIndicatorLine
                        tDateProfile={tDateProfile}
                        nowMs={props.nowMs}
                        slotWidth={slotWidth}
                        clipStart={slotDateShift?.[0]}
                      />
                    )}
                  </div>
                  <div
                    // roving-origin for all types of resource(-group)-rows
                    // is ZERO-height, always fixed to top, but has definet x-coordinate and width
                    role="presentation"
                    className={classNames.abs}
                    style={{
                      top: 0,
                      insetInlineStart: slotDateShift?.[0],
                      width: slotDateShift ? (slotDateShift[1] - slotDateShift[0]) : undefined,
                    }}
                  >
                    {groupRowPositions.map((rowPosition) => {
                      const rowLayout = rowPosition.item
                      const group = rowLayout.entity
                      const groupKey = rowPosition.key

                      return (
                        <div
                          key={groupKey}
                          role="presentation"
                          className={joinClassNames(
                            classNames.fillX,
                            classNames.flexRow,
                          )}
                          style={{
                            top: rowPosition.start,
                          }}
                        >
                          <GroupLane
                            cellIdPrefix={cellIdPrefix}
                            inTreeGrid={hasNesting}
                            cellRowIndex={1 + totalHeaderRowSpan + rowLayout.rowIndex}
                            cellColIndex={colSpecs.length}
                            group={group}
                            borderBottom={rowLayout.visibleIndex < displayedRowCnt - 1}
                            innerHeightRef={this.timeEntityInnerHeightMap.createRef(groupKey)}
                            height={rowPosition.size}
                          />
                        </div>
                      )
                    })}

                    {resourceRowPositions.map((rowPosition) => {
                      const resourceLayout = rowPosition.item
                      const resource = resourceLayout.entity

                      return (
                        <ResourceLane
                          {...splitProps[resource.id]}
                          key={resource.id /* TODO: use rowPosition.key? */}
                          role="presentation"
                          cellIdPrefix={cellIdPrefix}
                          inTreeGrid={hasNesting}
                          cellRowIndex={1 + totalHeaderRowSpan + resourceLayout.rowIndex}
                          cellColIndex={colSpecs.length}
                          className={classNames.fillX}
                          resource={resource}
                          dateProfile={dateProfile}
                          tDateProfile={tDateProfile}
                          nowDate={props.nowDate}
                          nowMs={props.nowMs}
                          todayRange={props.todayRange}
                          businessHours={resource.businessHours || fallbackBusinessHours}
                          borderBottom={resourceLayout.visibleIndex < displayedRowCnt - 1}

                          // ref
                          heightRef={this.timeEntityInnerHeightMap.createRef(resource.id)}

                          // dimensions
                          slotWidth={props.slotWidth}

                          // position
                          top={rowPosition.start}
                          height={rowPosition.size}

                          // virtualization
                          clipStart={slotDateShift?.[0]}
                          clipEnd={slotDateShift?.[1]}
                        />
                      )
                    })}
                  </div>
                  {timelineNeedsBottomFiller && (
                    <div
                      className={joinClassNames(
                        generateClassName(options.fillerClass, { inTableHeader: false }),
                        classNames.borderlessX,
                        classNames.borderlessBottom,
                        classNames.fillX,
                      )}
                      style={{
                        top: yFillBottom,
                        minHeight: timelineBottomFiller,
                      }}
                    />
                  )}
                </div>
              </Scroller>

              {/* time-area FOOTER
              ---------------------------------------------------------------------------- */}
              {Boolean(footerScrollbarSticky) && (
                <FooterScrollbar
                  isSticky
                  canvasWidth={timeCanvasWidth}
                  scrollbarWidthRef={this.handleTimeBottomScrollbarWidth}
                  scrollerRef={this.timeFooterScrollerRef}
                />
              )}

              <Ruler widthRef={this.handleTimeTotalWidth} />
            </>
          }
        />
      </ViewContainer>
    )
  }

  // Lifecycle
  // -----------------------------------------------------------------------------------------------

  componentDidMount() {
    const { props, context } = this
    this._isUnmounting = false

    this.timeScroller = new ScrollerSyncer(true) // horizontal=true
    this.bodyScroller = new ScrollerSyncer() // horizontal=false
    this.spreadsheetScroller = new ScrollerSyncer(true) // horizontal=true

    this.updateScrollersSyncers()
    this.updateWindowScrolling()

    if (props.initialScroll) {
      this.scroll = { ...props.initialScroll } // copy
      this.applyEntityScroll()
      this.applyTimeScroll()
    } else {
      this.resetTimeScroll()
    }

    this.timeScroller.addScrollListener(this.handleTimeScroll)
    this.timeScroller.addScrollEndListener(this.handleTimeScrollEnd)

    this.bodyScroller.addScrollStartListener(this.handleEntityScrollStart)
    this.bodyScroller.addScrollListener(this.handleEntityScroll)
    this.bodyScroller.addScrollEndListener(this.handleEntityScrollEnd)

    context.emitter.on('_timeScrollRequest', this.handleTimeScrollRequest)
    context.emitter.on('_resourceScrollRequest', this.handleResourceScrollRequest)
  }

  componentDidUpdate(prevProps: ResourceTimelineLayoutNormalProps, prevState: ResourceTimelineViewState) {
    const { props, state } = this
    const { options } = this.context

    this.updateScrollersSyncers()
    this.updateWindowScrolling()

    const dateProfileChange = prevProps.dateProfile !== props.dateProfile
    const slotWidthChange = prevProps.slotWidth !== props.slotWidth
    const timeCanvasWidthChange = prevProps.timeCanvasWidth !== props.timeCanvasWidth
    const timeClientWidthChange = prevState.timeClientWidth !== state.timeClientWidth

    if (dateProfileChange || slotWidthChange || timeCanvasWidthChange || timeClientWidthChange) {
      if (dateProfileChange && options.scrollTimeReset) {
        this.resetTimeScroll()
      } else {
        this.applyTimeScroll()
      }
    }

    /*
    Unfortunately this will execute after auto-scroll finished but before scrollEnd can record
    the updated scroll positioning, causing a scroll-jump to the last recorded entityScroll.
    */
    if (this.queuedEntityScroll) {
      // console.log('queuedEntityScroll!')
      this.queuedEntityScroll = false
      this.applyEntityScroll()
    }
  }

  componentWillUnmount() {
    this._isUnmounting = true
    this.slotInnerWidth = undefined
    this.timeScroller.destroy()
    this.bodyScroller.destroy()
    this.spreadsheetScroller.destroy()
    this.destroyWindowScrolling()

    this.bodyScroller.removeScrollEndListener(this.handleEntityScrollEnd)
    this.bodyScroller.removeScrollListener(this.handleEntityScroll)

    this.context.emitter.off('_timeScrollRequest', this.handleTimeScrollRequest)
    this.context.emitter.off('_resourceScrollRequest', this.handleResourceScrollRequest)
  }

  // Sizing
  // -----------------------------------------------------------------------------------------------

  private handleSpreadsheetClientWidth = (spreadsheetClientWidth: number) => {
    if (this._isUnmounting) return
    setRef(this.props.spreadsheetClientWidthRef, spreadsheetClientWidth)
  }

  private handleSpreadsheetBottomScrollbarWidth = (spreadsheetBottomScrollbarWidth: number) => {
    this.setState({
      spreadsheetBottomScrollbarWidth,
    })
  }

  private handleTimeTotalWidth = (timeTotalWidth: number) => {
    if (this._isUnmounting) return
    this.setState({
      timeTotalWidth,
    })
  }

  private handleTimeClientWidth = (timeClientWidth: number) => {
    if (this._isUnmounting) return
    setRef(this.props.timeClientWidthRef, timeClientWidth)

    this.setState({
      timeClientWidth,
    })

    this.slotVirtualizer.handleViewportSize(timeClientWidth)
    for (const timeHeaderVirtualizer of this.timeHeaderVirtualizers) {
      timeHeaderVirtualizer.handleViewportSize(timeClientWidth)
      // TODO: what about difference in scrollbar width?
    }
  }

  private handleTimeClientHeight = (timeClientHeight: number) => {
    if (this._isUnmounting) return
    this.setState({
      timeClientHeight,
    })
    if (!getIsHeightAuto(this.context.options)) {
      this.setVirtualizerViewportSize(timeClientHeight)
    }
  }

  private handleTimeBottomScrollbarWidth = (timeBottomScrollbarWidth: number) => {
    if (this._isUnmounting) return
    this.setState({
      timeBottomScrollbarWidth,
    })
  }

  private handleSlotInnerWidths = () => {
    if (this._isUnmounting) return
    const headerSlotInnerWidth = this.headerRowInnerWidthMap.current.get(this.props.tDateProfile.cellRows.length - 1)

    if (headerSlotInnerWidth != null && headerSlotInnerWidth !== this.slotInnerWidth) {
      this.slotInnerWidth = headerSlotInnerWidth
      setRef(this.props.slotInnerWidthRef, headerSlotInnerWidth)
    }
  }

  // Virtualizer Utils
  // -----------------------------------------------------------------------------------------------

  private setVirtualizerViewportSize(height: number) {
    this.rowVirtualizer.handleViewportSize(height)

    for (const groupColVirtualizer of this.groupColVirtualizers) {
      groupColVirtualizer.handleViewportSize(height)
    }
  }

  // # of pixels
  private currentEntityScroll: number

  private handleAnyEntityScroll(scroll: number) {
    this.currentEntityScroll = scroll
    this.updateVirtualizerScroll()
  }

  private updateVirtualizerScroll = debounce(() => {
    const scroll = this.currentEntityScroll

    this.rowVirtualizer.handleScroll(scroll)

    for (const groupColVirtualizer of this.groupColVirtualizers) {
      groupColVirtualizer.handleScroll(scroll)
    }
  }, 10)[0]

  // Window Scrolling
  // -----------------------------------------------------------------------------------------------

  private isTrackingWindowScroll = false
  private bodyOffset = 0
  private lastOffsetQuery = 0
  private handleWindowResize: () => void
  private cancelWindowResize: () => void

  private updateWindowScrolling() {
    if (getIsHeightAuto(this.context.options)) {
      if (!this.isTrackingWindowScroll) {
        this.isTrackingWindowScroll = true
        this.setVirtualizerViewportSize(window.innerHeight)
        ;([this.handleWindowResize, this.cancelWindowResize] = debounce(() => {
          this.setVirtualizerViewportSize(window.innerHeight)
        }, 200))
        window.addEventListener('resize', this.handleWindowResize)
        window.addEventListener('scroll', this.handleWindowScroll, { passive: true })
      }
    } else {
      this.destroyWindowScrolling()
    }
  }

  private destroyWindowScrolling() {
    if (this.isTrackingWindowScroll) {
      this.isTrackingWindowScroll = false
      this.cancelWindowResize()
      window.removeEventListener('resize', this.handleWindowResize)
      window.removeEventListener('scroll', this.handleWindowScroll, { passive: true } as any)
    }
  }

  private handleWindowScroll = () => {
    const scrollY = window.scrollY
    const now = Date.now()

    if (now - this.lastOffsetQuery > 200) {
      this.lastOffsetQuery = now
      this.bodyOffset = this.bodyEl.getBoundingClientRect().top + scrollY
    }

    this.handleAnyEntityScroll(scrollY - this.bodyOffset)
  }

  // Scrolling
  // -----------------------------------------------------------------------------------------------

  private updateScrollersSyncers() {
    this.timeScroller.handleChildren([
      this.timeHeaderScrollerRef.current,
      this.timeBodyScrollerRef.current,
      this.timeFooterScrollerRef.current,
    ])

    this.bodyScroller.handleChildren([
      this.spreadsheetBodyScrollerRef.current,
      this.timeBodyScrollerRef.current,
    ])

    this.spreadsheetScroller.handleChildren([
      this.spreadsheetHeaderScrollerRef.current,
      this.spreadsheetBodyScrollerRef.current,
      this.spreadsheetFooterScrollerRef.current,
    ])
  }

  // TIME Scrolling
  // -----------------------------------------------------------------------------------------------

  private resetTimeScroll(): void {
    this.handleTimeScrollRequest(this.context.options.scrollTime)
  }

  private handleTimeScrollRequest = (timeScroll: Duration) => {
    this.scroll.time = timeScroll
    this.applyTimeScroll()
  }

  // HACKY
  // can't use isDevice because we want programmatic .scrollLeft assignments to work with scroll-virtualization too.
  // the main reason we use a isDevice gate is to prevent the initial-scroll assignment from triggering handleTimeScroll,
  // but the debounce luckily helps us in this case
  private handleTimeScroll = (_isDevice: boolean, scroll: number) => {
    this.scroll.x = scroll
    this._handleTimeScroll()
  }
  private _handleTimeScroll = debounce(() => {
    this.scroll.time = undefined // prevents computeTimeScroll from computing based on time
    const scrollX = this.scroll.x

    this.slotVirtualizer.handleScroll(scrollX)
    for (const timeHeaderVirtualizer of this.timeHeaderVirtualizers) {
      timeHeaderVirtualizer.handleScroll(scrollX)
    }
  }, 10)[0]

  private handleTimeScrollEnd = () => {
    setRef(this.props.scrollRef, this.scroll)
  }

  private applyTimeScroll() {
    const x = this.computeTimeScroll()

    if (x !== undefined) {
      this.timeScroller.scrollTo({ x })

      if (this.scroll.x !== x) {
        this.scroll.x = x
        setRef(this.props.scrollRef, this.scroll)
      }
    }
  }

  // used by render() for virtualization too
  private computeTimeScroll(): number | undefined {
    const { props, context, scroll } = this
    const { tDateProfile } = props
    const slotWidth = props.slotWidth ?? ESTIMATED_SLOT_WIDTH
    let { x, time } = scroll

    if (time) {
      x = timeToCoord(time, context.dateEnv, props.dateProfile, tDateProfile, slotWidth)

      if (x) {
        x += 1 // overcome border. TODO: DRY this up
      }
    }

    if (x !== undefined && this.maxHScroll !== undefined) {
      x = Math.min(this.maxHScroll, x)
    }

    return x
  }

  // ENTITY (RESOURCE) Scrolling
  // -----------------------------------------------------------------------------------------------

  private isScrolling = false

  // REQUESTED scroll by external systems
  // (for bodyScroller only, NOT window)
  private handleResourceScrollRequest = (resourceId: string) => {
    this.scroll.entityId = resourceId
    this.scroll.fromBottom = undefined

    // The resource might not be rendered yet, such as when added within batchRendering. Otherwise
    // render() would virtualize rows around the requested scroll without ever applying it
    if (!this.applyEntityScroll()) {
      this.queuedEntityScroll = true
    }
  }

  // START vertical scroll
  // (for bodyScroller only, NOT window)
  private handleEntityScrollStart = () => {
    this.isScrolling = true
    this.scroll.entityId = undefined
    this.scroll.fromBottom = undefined
  }

  // DURING verical scroll
  // (for bodyScroller only, NOT window)
  private handleEntityScroll = (_isDevice: boolean, scroll: number) => {
    if (!getIsHeightAuto(this.context.options)) {
      this.handleAnyEntityScroll(scroll)

      // natural handler for vertical scroll, for either div or window scroll
      // if scrolls into slack area, move scroll to zero ASAP
      if (scroll < this.scrollSlack) {
        // console.log('ABORT', this.scrollSlack)
        this.scrollSlack = 0
        this.forceUpdate(() => {
          this.bodyScroller.scrollTo({ y: 0 })
        })
      }
    }
  }

  // END vertical scroll
  // (for bodyScroller only, NOT window)
  private handleEntityScrollEnd = () => {
    this.isScrolling = false

    if (!this.isTrackingWindowScroll) {
      const { bodyLayouts, bodyTops, bodyHeights, scroll } = this
      const y = this.bodyScroller.y

      if (!y) {
        // If already at top, keep at top. Anchoring to the first row would hide any rows that are
        // later inserted above it
        scroll.entityId = undefined
        scroll.fromBottom = undefined
      } else {
        const coordRes = findEntityByCoord(
          bodyLayouts,
          bodyTops,
          bodyHeights,
          y,
          createEntityId,
        )

        if (coordRes) {
          const [entity, elTop, elHeight] = coordRes

          scroll.entityId = createEntityId(entity)
          scroll.fromBottom = elTop + elHeight - y
        }
      }

      // At scrolling end, convert scrollSlack into real scroll and zero out
      // TODO: have below be in closure as well?
      const { scrollSlack } = this
      if (scrollSlack) {
        // console.log('CONSUMING', scrollSlack)
        this.scrollSlack = 0
        this.forceUpdate(() => {
          this.bodyScroller.scrollTo({ y: y - scrollSlack })
        })
      }
    }
  }

  // returns whether applied
  private applyEntityScroll(): boolean {
    const scrollTop = this.computeEntityScroll()
    if (scrollTop !== undefined) {
      this.bodyScroller.scrollTo({ y: scrollTop })
      return true
    }
    return false
  }

  private computeEntityScroll(): number | undefined {
    const { bodyTops, bodyHeights, scroll } = this
    const { entityId, fromBottom } = scroll

    if (entityId) {
      const top = bodyTops.get(entityId)
      const height = bodyHeights.get(entityId)

      if (top != null) {
        const bottom = top + height
        const requestedScrollTop =
          fromBottom != null ?
            bottom - fromBottom : // pixels from bottom edge
            top + // just use top edge
              (top ? 1 : 0) // overcome top border

        return Math.min(this.maxVScroll, requestedScrollTop)
      }
    }
  }

  // Hit System
  // -----------------------------------------------------------------------------------------------

  handleBodyEl = (el: HTMLElement | null) => {
    this.bodyEl = el

    if (el) {
      this.context.registerInteractiveComponent(this, { el })
    } else {
      this.context.unregisterInteractiveComponent(this)
    }
  }

  prepareHits(): void {
    /*
    HACK for queuedHeightChange usage in componentDidUpdate
    This executes when a drag/resize starts and clears the last recorded entity scroll
    */
    this.scroll.entityId = undefined
    this.scroll.fromBottom = undefined
  }

  queryHit(isRtl: boolean, positionLeft: number, positionTop: number): Hit {
    let { props, context, bodyLayouts, bodyTops, bodyHeights } = this
    const { dateProfile, tDateProfile, timeCanvasWidth } = props
    const slotWidth = props.slotWidth ?? ESTIMATED_SLOT_WIDTH
    const { dateEnv } = context

    let coordRes = findEntityByCoord(
      bodyLayouts,
      bodyTops,
      bodyHeights,
      positionTop,
      createEntityId,
    )

    if (coordRes) {
      let [entityAtTop, top, height] = coordRes

      if (!isEntityGroup(entityAtTop)) {
        let resource = entityAtTop
        let bottom = top + height

        const hitData = computeTimelineHitData(positionLeft, timeCanvasWidth, slotWidth, isRtl, tDateProfile, dateEnv)

        if (!hitData) { // in the dead tail of a DST-truncated slot
          return null
        }

        return {
          dateProfile,
          dateSpan: {
            ...hitData.dateSpan,
            resourceId: resource.id,
          },
          rect: {
            ...hitData.rect,
            top,
            bottom,
          },
          getDayEl: () => getTimelineSlotEl(this.bodyEl, hitData.slatIndex),
          layer: 0,
        }
      }
    }

    return null
  }
}
