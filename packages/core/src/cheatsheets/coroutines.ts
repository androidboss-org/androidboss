import type { Cheatsheet, Entry } from './types.ts';

const GUIDE = 'https://kotlinlang.org/docs/coroutines-guide.html';
const ANDROID = 'https://developer.android.com/kotlin/coroutines';
const FLOW = 'https://developer.android.com/kotlin/flow';
const TEST = 'https://developer.android.com/kotlin/coroutines/test';

const k = (e: Omit<Entry, 'lang' | 'verify'>): Entry => ({ lang: 'kotlin', verify: 'compile', ...e });

/**
 * Snippets compile in cheatsheets.tools.test.ts against kotlinx-coroutines and
 * AndroidX Lifecycle, with a small stub: `api: Api` (products(), product(id),
 * search(q)) and `data class Product(val id: Int, val name: String)`. Body snippets
 * run inside a CoroutineScope; 'top-level' ones are declarations.
 */
export const coroutines: Cheatsheet = {
  slug: 'coroutines',
  title: 'Kotlin coroutines and Flow cheatsheet',
  tagline: 'Coroutines and Flow for Android: scopes, dispatchers, cancellation, errors, operators, StateFlow and tests.',
  intro:
    'The coroutine and Flow patterns Android developers use most, as short snippets that compile against kotlinx.coroutines 1.11 and AndroidX Lifecycle 2.9. Copy them into a ViewModel, repository or test.',
  tool: { name: 'kotlinx.coroutines', version: '1.11.0, Kotlin 2.4', checkedOn: '2026-11-08', docs: GUIDE },
  variables: [],
  related: ['/tools/json-to-kotlin/', '/tools/expect-actual/', '/tools/kmp-libraries/', '/agents/crash-to-prompt/'],
  sections: [
    {
      id: 'launch',
      title: 'Start coroutines',
      entries: [
        k({ id: 'view-model-scope', title: 'Load data in a ViewModel', context: 'top-level', command: 'class ProductsViewModel(private val api: Api) : ViewModel() {\n    val products = MutableStateFlow<List<Product>>(emptyList())\n\n    fun refresh() {\n        viewModelScope.launch {\n            products.value = api.products()\n        }\n    }\n}', note: 'viewModelScope is cancelled when the ViewModel is cleared, so work stops when the screen goes away.', tags: ['viewmodel', 'viewModelScope', 'launch'], docs: ANDROID }),
        k({ id: 'parallel', title: 'Run requests in parallel and wait for both', command: 'val products = async { api.products() }\nval featured = async { api.product(1) }\nlog("${products.await().size} products, featured ${featured.await().name}")', note: 'If one fails, the other is cancelled and the error is thrown from await().', tags: ['async', 'await', 'parallel'], docs: `${GUIDE}#concurrent-using-async` }),
        k({ id: 'with-context', title: 'Move blocking work off the main thread', command: 'val text = withContext(Dispatchers.IO) {\n    java.io.File("cache.json").readText()\n}', note: 'Use Dispatchers.IO for files and blocking APIs, Dispatchers.Default for CPU work. Suspending libraries (Retrofit, Room, Ktor) already switch for you.', tags: ['dispatchers', 'io', 'withContext', 'main thread'], docs: ANDROID }),
        k({ id: 'coroutine-scope', title: 'Wait for several child coroutines', command: 'coroutineScope {\n    launch { api.products() }\n    launch { api.product(1) }\n}\nlog("both finished")', tags: ['coroutineScope', 'structured concurrency'], docs: GUIDE }),
        k({ id: 'supervisor', title: 'Keep going when one child fails', command: 'supervisorScope {\n    launch { api.product(1) }\n    launch { api.product(2) }\n}', note: 'Without supervisorScope, one failing child cancels its siblings. Child failures still need a handler or try/catch.', tags: ['supervisorScope', 'errors', 'siblings'], docs: `${GUIDE}#supervision` }),
        k({ id: 'collect-lifecycle', title: 'Collect a Flow only while the screen is visible', context: 'top-level', command: 'fun observe(owner: LifecycleOwner, products: Flow<List<Product>>) {\n    owner.lifecycleScope.launch {\n        owner.repeatOnLifecycle(Lifecycle.State.STARTED) {\n            products.collect { list -> log(list.size) }\n        }\n    }\n}', note: 'In Compose, use collectAsStateWithLifecycle() instead.', tags: ['lifecycle', 'repeatOnLifecycle', 'collect', 'fragment'], docs: 'https://developer.android.com/topic/libraries/architecture/coroutines#restart' }),
      ],
    },
    {
      id: 'cancel',
      title: 'Cancellation and timeouts',
      entries: [
        k({ id: 'timeout', title: 'Give up after a timeout', command: 'val product = withTimeoutOrNull(5.seconds) { api.product(1) }\nif (product == null) log("timed out")', note: 'withTimeout throws TimeoutCancellationException instead of returning null.', tags: ['timeout', 'withTimeout'], docs: `${GUIDE}#timeout` }),
        k({ id: 'cancel-job', title: 'Cancel a job and wait for it to finish', command: 'val job = launch { api.products() }\njob.cancelAndJoin()', tags: ['cancel', 'job', 'join'], docs: GUIDE }),
        k({ id: 'cooperative', title: 'Make a long loop cancellable', command: 'withContext(Dispatchers.Default) {\n    repeat(1_000_000) { i ->\n        ensureActive()\n        if (i % 1000 == 0) yield()\n    }\n}', note: 'CPU loops don’t check for cancellation on their own; ensureActive() throws as soon as the job is cancelled.', tags: ['cancellation', 'ensureActive', 'yield', 'loop'], docs: `${GUIDE}#making-computation-code-cancellable` }),
        k({ id: 'cleanup', title: 'Run cleanup that must finish after cancellation', command: 'try {\n    api.products()\n} finally {\n    withContext(NonCancellable) {\n        api.product(0) // e.g. tell the server you left\n    }\n}', tags: ['finally', 'NonCancellable', 'cleanup'], docs: GUIDE }),
        k({ id: 'rethrow-cancellation', title: 'Catch errors without swallowing cancellation', command: 'val result = try {\n    api.products()\n} catch (e: CancellationException) {\n    throw e\n} catch (e: Exception) {\n    emptyList()\n}', note: 'runCatching { } and catch (e: Exception) also catch CancellationException, which keeps a cancelled coroutine running.', tags: ['errors', 'try', 'CancellationException', 'runCatching'], docs: ANDROID }),
      ],
    },
    {
      id: 'errors',
      title: 'Errors',
      entries: [
        k({ id: 'handler', title: 'Handle uncaught errors in launched coroutines', command: 'val handler = CoroutineExceptionHandler { _, e -> log("failed: $e") }\nval scope = CoroutineScope(SupervisorJob() + Dispatchers.Default + handler)\nscope.launch { api.products() }', note: 'Handlers only work on root coroutines started with launch; async keeps its error until await().', tags: ['CoroutineExceptionHandler', 'errors', 'crash'], docs: `${GUIDE}#coroutineexceptionhandler` }),
        k({ id: 'retry', title: 'Retry a request with backoff', command: 'var delayMs = 500L\nval products = run {\n    repeat(3) {\n        try { return@run api.products() } catch (e: java.io.IOException) { delay(delayMs); delayMs *= 2 }\n    }\n    api.products()\n}', tags: ['retry', 'backoff', 'network'], docs: ANDROID }),
      ],
    },
    {
      id: 'flow-build',
      title: 'Create flows',
      entries: [
        k({ id: 'flow-builder', title: 'Emit values from a suspending source', command: 'val ticks: Flow<Int> = flow {\n    repeat(3) { i ->\n        emit(i)\n        delay(1.seconds)\n    }\n}', tags: ['flow', 'emit', 'builder'], docs: FLOW }),
        k({ id: 'callback-flow', title: 'Turn a callback API into a Flow', context: 'top-level', command: 'fun LocationClient.locations(): Flow<Location> = callbackFlow {\n    val listener: (Location) -> Unit = { trySend(it) }\n    addListener(listener)\n    awaitClose { removeListener(listener) }\n}', note: 'awaitClose keeps the flow open and unregisters the listener when the collector stops.', tags: ['callbackFlow', 'listener', 'callback'], docs: `${FLOW}#callback` }),
        k({ id: 'state-flow', title: 'Hold UI state in a StateFlow', context: 'top-level', command: 'data class UiState(val loading: Boolean = false, val items: List<Product> = emptyList())\n\nclass CatalogViewModel(private val api: Api) : ViewModel() {\n    private val _state = MutableStateFlow(UiState())\n    val state: StateFlow<UiState> = _state.asStateFlow()\n\n    fun load() = viewModelScope.launch {\n        _state.update { it.copy(loading = true) }\n        val items = api.products()\n        _state.update { it.copy(loading = false, items = items) }\n    }\n}', note: 'update { } is atomic, so concurrent changes don’t overwrite each other.', tags: ['StateFlow', 'MutableStateFlow', 'update', 'ui state'], docs: 'https://developer.android.com/kotlin/flow/stateflow-and-sharedflow' }),
        k({ id: 'events', title: 'Send one-off events to the UI', context: 'top-level', command: 'class CheckoutViewModel : ViewModel() {\n    private val _events = Channel<String>(Channel.BUFFERED)\n    val events: Flow<String> = _events.receiveAsFlow()\n\n    fun pay() = viewModelScope.launch { _events.send("Payment done") }\n}', note: 'A Channel delivers each event once, even if no one is collecting yet.', tags: ['events', 'channel', 'snackbar', 'navigation'], docs: 'https://developer.android.com/topic/architecture/ui-layer/events' }),
        k({ id: 'state-in', title: 'Share a Flow as state, stopping when no one watches', context: 'top-level', command: 'class SearchViewModel(api: Api) : ViewModel() {\n    val products: StateFlow<List<Product>> = flow { emit(api.products()) }\n        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())\n}', note: 'The 5-second grace period keeps the upstream alive through a rotation.', tags: ['stateIn', 'WhileSubscribed', 'shareIn'], docs: 'https://developer.android.com/kotlin/flow/stateflow-and-sharedflow' }),
      ],
    },
    {
      id: 'operators',
      title: 'Flow operators',
      entries: [
        k({ id: 'search', title: 'Search as the user types', context: 'top-level', command: '@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)\nfun searchResults(query: Flow<String>, api: Api): Flow<List<Product>> =\n    query\n        .debounce(300.milliseconds)\n        .distinctUntilChanged()\n        .filter { it.length >= 2 }\n        .flatMapLatest { q -> flow { emit(api.search(q)) } }', note: 'flatMapLatest cancels the previous search when a new query arrives.', tags: ['debounce', 'flatMapLatest', 'search', 'distinctUntilChanged'], docs: FLOW }),
        k({ id: 'combine', title: 'Combine the latest values of several flows', context: 'top-level', command: 'fun visible(products: Flow<List<Product>>, filter: Flow<String>): Flow<List<Product>> =\n    combine(products, filter) { list, text -> list.filter { text in it.name } }', tags: ['combine', 'merge', 'filter'], docs: FLOW }),
        k({ id: 'catch', title: 'Handle errors in a Flow', command: 'flow { emit(api.products()) }\n    .retry(2) { it is java.io.IOException }\n    .catch { e -> log("failed: $e"); emit(emptyList()) }\n    .collect { log(it.size) }', note: 'catch only handles errors from upstream; errors in collect still throw.', tags: ['catch', 'retry', 'errors'], docs: `${FLOW}#catch` }),
        k({ id: 'flow-on', title: 'Run upstream work on another dispatcher', command: 'flow { emit(java.io.File("big.json").readText()) }\n    .map { it.length }\n    .flowOn(Dispatchers.IO)\n    .collect { log(it) }', note: 'flowOn changes the dispatcher for everything above it; collect still runs in the caller’s context.', tags: ['flowOn', 'dispatchers', 'threading'], docs: FLOW }),
        k({ id: 'on-each', title: 'Side effects, start and completion', command: 'flow { emit(api.products()) }\n    .onStart { log("loading") }\n    .onEach { log("got ${it.size}") }\n    .onCompletion { cause -> log("done, error = $cause") }\n    .collect()', tags: ['onStart', 'onEach', 'onCompletion', 'loading'], docs: FLOW }),
        k({ id: 'conflate', title: 'Skip values a slow collector can’t keep up with', command: 'flow { repeat(100) { emit(it) } }\n    .conflate()\n    .collect { delay(100); log(it) }', note: 'Use collectLatest instead to cancel the slow work for each newer value.', tags: ['conflate', 'buffer', 'backpressure', 'collectLatest'], docs: `${GUIDE}#conflation` }),
      ],
    },
    {
      id: 'testing',
      title: 'Testing',
      entries: [
        k({ id: 'run-test', title: 'Test suspend code with virtual time', context: 'top-level', command: 'class RepoTest {\n    @org.junit.Test\n    fun loadsAfterDelay() = runTest {\n        delay(10.seconds) // skipped instantly\n        check(currentTime == 10_000L)\n    }\n}', note: 'runTest skips delays, so tests with timeouts and retries run in milliseconds.', tags: ['runTest', 'test', 'virtual time', 'delay'], docs: TEST }),
        k({ id: 'main-dispatcher', title: 'Replace Dispatchers.Main in unit tests', context: 'top-level', command: '@OptIn(ExperimentalCoroutinesApi::class)\nclass ViewModelTest {\n    private val dispatcher = StandardTestDispatcher()\n\n    @org.junit.Before fun setUp() = Dispatchers.setMain(dispatcher)\n    @org.junit.After fun tearDown() = Dispatchers.resetMain()\n\n    @org.junit.Test\n    fun loads() = runTest(dispatcher) {\n        advanceUntilIdle()\n    }\n}', note: 'viewModelScope uses Dispatchers.Main, which doesn’t exist on the JVM; without this, tests fail with “Module with the Main dispatcher is missing”.', tags: ['setMain', 'viewmodel', 'test', 'Dispatchers.Main'], docs: `${TEST}#setting-main-dispatcher` }),
        k({ id: 'test-flow', title: 'Collect a Flow’s values in a test', context: 'top-level', command: 'class FlowTest {\n    @org.junit.Test\n    fun emitsTicks() = runTest {\n        val values = mutableListOf<Int>()\n        backgroundScope.launch { flowOf(1, 2, 3).toList(values) }\n        advanceUntilIdle()\n        check(values == listOf(1, 2, 3))\n    }\n}', note: 'backgroundScope is cancelled when the test ends, so collecting a never-ending StateFlow doesn’t hang.', tags: ['flow', 'test', 'backgroundScope', 'toList'], docs: 'https://developer.android.com/kotlin/flow/test' }),
      ],
    },
  ],
};
