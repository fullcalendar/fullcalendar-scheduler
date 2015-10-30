
class ResourceManager extends Class

	@mixin Emitter

	@resourceGuid: 1
	@ajaxDefaults:
		dataType: 'json'
		cache: false

	calendar: null
	topLevelResources: null # if null, indicates not fetched
	resourcesById: null
	fetching: null # a promise. the last fetch. never cleared afterwards


	constructor: (@calendar) ->
		@unsetResources()


	# Resource Data Getting
	# ------------------------------------------------------------------------------------------------------------------


	getResources: -> # returns a promise
		# never fetched? then fetch... (TODO: decouple from fetching)
		if not @fetching
			getting = $.Deferred()
			@fetchResources()
				.done (resources) ->
					getting.resolve(resources)
				.fail ->
					getting.resolve([])
			getting
		# otherwise, return what we already have...
		else
			$.Deferred().resolve(@topLevelResources).promise()


	fetchResources: -> # returns a promise
		prevFetching = @fetching
		$.when(prevFetching).then =>
			@fetching = @fetchResourceInputs().then (resourceInputs) =>
				@setResources(resourceInputs)
				if prevFetching
					@trigger('reset', @topLevelResources)
				@topLevelResources


	fetchResourceInputs: -> # returns a promise
		deferred = $.Deferred()
		source = @calendar.options['resources']

		if $.type(source) == 'string'
			source = { url: source }

		switch $.type(source)

			when 'function'
				source (resourceInputs) =>
					deferred.resolve(resourceInputs)
				# TODO: add a max timeout mechanism

			when 'object'
				promise = $.ajax($.extend({}, ResourceManager.ajaxDefaults, source))

			when 'array'
				deferred.resolve(source)

			else
				deferred.resolve([])

		promise or= deferred.promise()

		if not promise.state() == 'pending'
			@calendar.pushLoading()
			promise.always ->
				@calendar.popLoading()

		promise


	getResourceById: (id) -> # assumes already returned from fetch
		@resourcesById[id]


	# Resource Adding
	# ------------------------------------------------------------------------------------------------------------------


	unsetResources: ->
		@topLevelResources = []
		@resourcesById = {}


	setResources: (resourceInputs) ->
		@unsetResources()

		resources = for resourceInput in resourceInputs
			@buildResource(resourceInput)

		validResources = (resource for resource in resources \
			when @addResourceToIndex(resource))

		for resource in validResources
			@addResourceToTree(resource)

		@calendar.trigger('resourcesSet', null, @topLevelResources)


	addResource: (resourceInput) -> # returns a promise
		$.when(@fetching).then =>
			resource = @buildResource(resourceInput)
			if @addResourceToIndex(resource)
				@addResourceToTree(resource)
				@trigger('add', resource)
				resource
			else
				false


	addResourceToIndex: (resource) ->
		if @resourcesById[resource.id]
			false
		else
			@resourcesById[resource.id] = resource
			for child in resource.children
				@addResourceToIndex(child)
			true


	addResourceToTree: (resource) ->
		if not resource.parent
			parentId = String(resource[@getResourceParentField()] or '')

			if parentId
				parent = @resourcesById[parentId]
				if parent
					resource.parent = parent
					siblings = parent.children
				else
					return false
			else
				siblings = @topLevelResources

			siblings.push(resource)
		true


	# Resource Removing
	# ------------------------------------------------------------------------------------------------------------------


	removeResource: (idOrResource) ->
		id =
			if typeof idOrResource == 'object'
				idOrResource.id
			else
				idOrResource

		$.when(@fetching).then =>
			resource = @removeResourceFromIndex(id)
			if resource
				@removeResourceFromTree(resource)
				@trigger('remove', resource)
			resource


	removeResourceFromIndex: (resourceId) ->
		resource = @resourcesById[resourceId]
		if resource
			delete @resourcesById[resourceId]
			for child in resource.children
				@removeResourceFromIndex(child.id)
			resource
		else
			false


	removeResourceFromTree: (resource, siblings=@topLevelResources) ->
		for sibling, i in siblings
			if sibling == resource
				resource.parent = null
				siblings.splice(i, 1)
				return true
			if @removeResourceFromTree(resource, sibling.children)
				return true
		false


	# Resource Data Utils
	# ------------------------------------------------------------------------------------------------------------------


	buildResource: (resourceInput) ->

		resource = $.extend({}, resourceInput)
		resource.id = String((resourceInput.id ? '_fc' + (ResourceManager.resourceGuid++)) or '')

		# TODO: consolidate repeat logic
		rawClassName = resourceInput.eventClassName
		resource.eventClassName =
			switch $.type(rawClassName)
				when 'string'
					rawClassName.split(/\s+/)
				when 'array'
					rawClassName
				else
					[]

		switch $.type(resourceInput.children)
			when 'array'
				resource.children =
					for childInput in resourceInput.children ? []
						child = @buildResource(childInput)
						child.parent = resource
						child
			when 'object'
				child = @buildResource(resourceInput.children)
				child.parent = resource
				resource.children = [child]

		resource


	# TODO: kill this!!!!!
	getResourceParentField: ->
		@calendar.options['resourceParentField'] or 'parentId' # TODO: put into defaults


	# Event Utils
	# ------------------------------------------------------------------------------------------------------------------


	getEventResourceId: (event) ->
		String(event[@getEventResourceField()] or '')


	setEventResourceId: (event, resourceId) ->
		event[@getEventResourceField()] = String(resourceId or '')


	getEventResourceField: ->
		@calendar.options['eventResourceField'] or 'resourceId' # TODO: put into defaults

