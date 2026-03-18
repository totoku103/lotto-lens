import { useState, useRef, useEffect, memo } from 'react'
import './App.css'

interface LottoSet {
  numbers: number[]
}

interface FrequencyGroup {
  frequency: number
  combinationCount: number
  combinations: number[][]
}

interface SimProgress {
  currentCount: number
  totalCount: number
  uniqueCombinations: number
  completed: boolean
}

interface SimResult {
  frequencyDistribution: Record<string, number>
  allFrequencyGroups: FrequencyGroup[]
}

// SSE raw 데이터 전체 타입 (파싱용)
interface SimulationProgress extends SimProgress {
  frequencyDistribution: Record<string, number>
  allFrequencyGroups: FrequencyGroup[]
}

function getBallColor(num: number): string {
  if (num <= 10) return 'ball-yellow'
  if (num <= 20) return 'ball-blue'
  if (num <= 30) return 'ball-red'
  if (num <= 40) return 'ball-gray'
  return 'ball-green'
}

function LottoBall({ number, small }: { number: number; small?: boolean }) {
  return (
    <span className={`lotto-ball ${getBallColor(number)} ${small ? 'lotto-ball-sm' : ''}`}>
      {number}
    </span>
  )
}

const LottoCard = memo(function LottoCard({ set, index }: { set: LottoSet; index: number }) {
  return (
    <div className="lotto-card" style={{ animationDelay: `${index * 0.08}s` }}>
      <span className="set-label">#{index + 1}</span>
      <div className="ball-row">
        {set.numbers.map((num) => (
          <LottoBall key={num} number={num} />
        ))}
      </div>
    </div>
  )
})

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const millis = Math.floor((ms % 1000) / 10)
  if (min > 0) {
    return `${min}분 ${sec.toString().padStart(2, '0')}초`
  }
  return `${sec}.${millis.toString().padStart(2, '0')}초`
}

function getDistributionBarColor(ratio: number): string {
  // ratio: 0(낮은 출현) ~ 1(높은 출현) → 파랑 → 초록 → 빨강
  const r = Math.round(ratio * 255)
  const b = Math.round((1 - ratio) * 255)
  const g = Math.round(Math.sin(ratio * Math.PI) * 200)
  return `rgb(${r}, ${g}, ${b})`
}

const DistributionChart = memo(function DistributionChart({
  distribution,
}: {
  distribution: Record<string, number>
}) {
  if (Object.keys(distribution).length === 0) {
    return <div className="chart-empty">데이터 없음</div>
  }

  const entries = Object.entries(distribution)
    .map(([k, v]) => ({ occurrences: Number(k), combCount: v }))
    .sort((a, b) => a.occurrences - b.occurrences)

  const maxCombCount = Math.max(...entries.map((e) => e.combCount), 1)
  const minOcc = entries[0]?.occurrences ?? 0
  const maxOcc = entries[entries.length - 1]?.occurrences ?? 1

  return (
    <div className="dist-chart-wrapper">
      <div className="dist-chart">
        {entries.map(({ occurrences, combCount }) => {
          const heightPct = (combCount / maxCombCount) * 100
          const ratio = maxOcc === minOcc ? 0.5 : (occurrences - minOcc) / (maxOcc - minOcc)
          const color = getDistributionBarColor(ratio)
          return (
            <div key={occurrences} className="dist-bar-col">
              <div
                className="dist-bar-fill"
                style={{ height: `${heightPct}%`, backgroundColor: color }}
                title={`출현 ${occurrences}회: ${formatNumber(combCount)}개 조합`}
              />
              <div className="dist-bar-label">{occurrences}</div>
            </div>
          )
        })}
      </div>
      <div className="dist-axis-labels">
        <span className="dist-axis-y-label">조합 수</span>
        <span className="dist-axis-x-label">출현 횟수</span>
      </div>
    </div>
  )
})

const FrequencyGroupSection = memo(function FrequencyGroupSection({
  group,
  defaultOpen,
  accentColor,
}: {
  group: FrequencyGroup
  defaultOpen: boolean
  accentColor: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`freq-group ${open ? 'freq-group-open' : ''}`}>
      <button
        className="freq-group-header"
        style={{ borderLeftColor: accentColor }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="freq-group-title">
          <span className="freq-group-count" style={{ color: accentColor }}>
            {formatNumber(group.frequency)}회 출현
          </span>
          <span className="freq-group-sub">
            — {formatNumber(group.combinationCount)}개 조합
          </span>
        </span>
        <span className="freq-group-icon">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="freq-group-body">
          {group.combinations.length === 0 ? (
            <div className="freq-group-too-many">
              조합이 너무 많아 표시할 수 없습니다 ({formatNumber(group.combinationCount)}개)
            </div>
          ) : (
            <ul className="freq-group-combos">
              {group.combinations.map((nums, i) => (
                <li key={i} className="combo-item">
                  <div className="combo-balls">
                    {nums.map((num) => (
                      <LottoBall key={num} number={num} small />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
})

function interpolateColor(ratio: number, highColor: boolean): string {
  // highColor=true: 빨간 계열 (높은 빈도 강조)
  // highColor=false: 파란 계열 (낮은 빈도 강조)
  if (highColor) {
    // ratio 0→1: #94a3b8 → #ef4444
    const r = Math.round(148 + (239 - 148) * ratio)
    const g = Math.round(163 + (68 - 163) * ratio)
    const b = Math.round(184 + (68 - 184) * ratio)
    return `rgb(${r},${g},${b})`
  } else {
    // ratio 0→1: #94a3b8 → #3b82f6
    const r = Math.round(148 + (59 - 148) * ratio)
    const g = Math.round(163 + (130 - 163) * ratio)
    const b = Math.round(184 + (246 - 184) * ratio)
    return `rgb(${r},${g},${b})`
  }
}

function App() {
  // --- 번호 생성 ---
  const [count, setCount] = useState(5)
  const [sets, setSets] = useState<LottoSet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- 탭 ---
  const [activeTab, setActiveTab] = useState<'generate' | 'simulate'>('generate')

  // --- 시뮬레이션 (상태 분리) ---
  const [simProgress, setSimProgress] = useState<SimProgress | null>(null)
  const [simResult, setSimResult] = useState<SimResult | null>(null)
  const [simRunning, setSimRunning] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    if (simRunning) {
      startTimeRef.current = Date.now()
      setElapsedMs(0)
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current)
      }, 50)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      // Update final elapsed time
      if (startTimeRef.current > 0) {
        setElapsedMs(Date.now() - startTimeRef.current)
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [simRunning])

  const generate = async () => {
    setLoading(true)
    setError(null)
    setSets([])
    try {
      const res = await fetch(`/api/lotto/generate?count=${count}`)
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`)
      const data: LottoSet[] = await res.json()
      setSets(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const startSimulation = () => {
    if (simRunning) return
    setSimError(null)
    setSimProgress(null)
    setSimResult(null)
    setSimRunning(true)

    const es = new EventSource('/api/lotto/simulate?count=150000000')
    esRef.current = es

    es.onmessage = (event) => {
      try {
        const data: SimulationProgress = JSON.parse(event.data)

        // 자주 변하는 경량 데이터는 항상 업데이트
        setSimProgress({
          currentCount: data.currentCount,
          totalCount: data.totalCount,
          uniqueCombinations: data.uniqueCombinations,
          completed: data.completed,
        })

        // 무거운 데이터는 frequencyDistribution이 비어있지 않을 때만 업데이트
        if (data.frequencyDistribution && Object.keys(data.frequencyDistribution).length > 0) {
          setSimResult({
            frequencyDistribution: data.frequencyDistribution,
            allFrequencyGroups: data.completed ? data.allFrequencyGroups : [],
          })
        }

        if (data.completed) {
          setSimRunning(false)
          es.close()
          esRef.current = null
        }
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      setSimError('SSE 연결 오류가 발생했습니다.')
      setSimRunning(false)
      es.close()
      esRef.current = null
    }
  }

  const stopSimulation = () => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setSimRunning(false)
  }

  const TOTAL_COMBINATIONS = 8145060
  const progress = simProgress ? (simProgress.currentCount / simProgress.totalCount) * 100 : 0
  const uniquePct = simProgress
    ? ((simProgress.uniqueCombinations / TOTAL_COMBINATIONS) * 100).toFixed(2)
    : '0.00'

  return (
    <div className="app">
      <header className="app-header">
        <h1>Lotto Lens</h1>
        <p className="subtitle">로또 번호 생성기 &amp; 시뮬레이션</p>
      </header>

      {/* 탭 */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'generate' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('generate')}
        >
          번호 생성
        </button>
        <button
          className={`tab-btn ${activeTab === 'simulate' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('simulate')}
        >
          추첨 시뮬레이션
        </button>
      </div>

      <main className="app-main">
        {/* ===== 번호 생성 탭 ===== */}
        {activeTab === 'generate' && (
          <>
            <div className="control-panel">
              <label className="count-label" htmlFor="count-select">
                생성 세트 수
              </label>
              <select
                id="count-select"
                className="count-select"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}세트
                  </option>
                ))}
              </select>
              <button
                className="generate-btn"
                onClick={generate}
                disabled={loading}
              >
                {loading ? '생성 중...' : '번호 생성'}
              </button>
            </div>

            <div className="legend">
              <span className="legend-item"><span className="legend-ball ball-yellow" />1~10</span>
              <span className="legend-item"><span className="legend-ball ball-blue" />11~20</span>
              <span className="legend-item"><span className="legend-ball ball-red" />21~30</span>
              <span className="legend-item"><span className="legend-ball ball-gray" />31~40</span>
              <span className="legend-item"><span className="legend-ball ball-green" />41~45</span>
            </div>

            {error && <div className="error-msg">{error}</div>}

            {sets.length > 0 && (
              <div className="sets-container">
                {sets.map((set, i) => (
                  <LottoCard key={i} set={set} index={i} />
                ))}
              </div>
            )}

            {!loading && sets.length === 0 && !error && (
              <div className="empty-state">
                버튼을 눌러 행운의 번호를 생성하세요
              </div>
            )}
          </>
        )}

        {/* ===== 시뮬레이션 탭 ===== */}
        {activeTab === 'simulate' && (
          <>
            <div className="control-panel">
              <div className="sim-info-text">
                <span className="count-label">총 1억 5천만 회 추첨 시뮬레이션</span>
              </div>
              <div className="sim-btn-group">
                <button
                  className="generate-btn sim-start-btn"
                  onClick={startSimulation}
                  disabled={simRunning}
                >
                  {simRunning ? '시뮬레이션 진행 중...' : '시뮬레이션 시작'}
                </button>
                {simRunning && (
                  <button className="stop-btn" onClick={stopSimulation}>
                    중지
                  </button>
                )}
              </div>
            </div>

            {simError && <div className="error-msg">{simError}</div>}

            {simProgress && (
              <>
                {/* 진행률 - simProgress에서 읽기 (자주 업데이트) */}
                <div className="progress-section">
                  <div className="progress-header">
                    <span className="progress-label">
                      {formatNumber(simProgress.currentCount)} / {formatNumber(simProgress.totalCount)} 회
                    </span>
                    <span className="progress-pct">{progress.toFixed(2)}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="elapsed-info">
                    <span className="elapsed-label">경과 시간</span>
                    <span className="elapsed-value">{formatElapsed(elapsedMs)}</span>
                  </div>
                  <div className="unique-combo-info">
                    <span className="unique-combo-label">발견된 고유 조합</span>
                    <span className="unique-combo-value">
                      {formatNumber(simProgress.uniqueCombinations)}
                      <span className="unique-combo-total"> / {formatNumber(TOTAL_COMBINATIONS)}</span>
                    </span>
                    <span className="unique-combo-pct">{uniquePct}%</span>
                  </div>
                  {simProgress.completed && (
                    <div className="sim-complete-badge">시뮬레이션 완료!</div>
                  )}
                </div>

                {/* 출현 빈도 분포 차트 - simResult에서 읽기 (드물게 업데이트) */}
                <div className="chart-section">
                  <h3 className="section-title">조합 출현 빈도 분포</h3>
                  <p className="section-desc">
                    X축: 출현 횟수 &nbsp;|&nbsp; Y축: 해당 횟수로 나온 조합 수
                    &nbsp;(이론적으로 포아송 분포 λ≈18.4 형태)
                  </p>
                  <DistributionChart
                    distribution={simResult?.frequencyDistribution ?? {}}
                  />
                  <div className="dist-legend">
                    <span className="dist-legend-item dist-legend-low">낮은 빈도</span>
                    <span className="dist-legend-arrow">→</span>
                    <span className="dist-legend-item dist-legend-high">높은 빈도</span>
                  </div>
                </div>

                {/* 출현 횟수별 전체 그룹 - simResult에서 읽기 */}
                <div className="stats-full">
                  <div className="stats-card">
                    <h4 className="stats-title">출현 횟수별 조합 (높은 순)</h4>
                    {simProgress.completed && simResult ? (
                      <div className="freq-group-list">
                        {simResult.allFrequencyGroups.map((group, i) => {
                          const total = simResult.allFrequencyGroups.length
                          const ratio = total <= 1 ? 0.5 : i / (total - 1)
                          const color = interpolateColor(1 - ratio, true)
                          return (
                            <FrequencyGroupSection
                              key={group.frequency}
                              group={group}
                              defaultOpen={i === 0}
                              accentColor={color}
                            />
                          )
                        })}
                      </div>
                    ) : (
                      <div className="combo-pending">완료 후 표시됩니다</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {!simProgress && !simRunning && !simError && (
              <div className="empty-state">
                시뮬레이션 시작 버튼을 눌러 추첨을 시작하세요
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App
