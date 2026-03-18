package kr.co.therene.lottolens.lotto.service;

import kr.co.therene.lottolens.lotto.dto.FrequencyGroup;
import kr.co.therene.lottolens.lotto.dto.LottoNumbers;
import kr.co.therene.lottolens.lotto.dto.SimulationProgress;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class LottoService {

    private static final int MIN_NUMBER = 1;
    private static final int MAX_NUMBER = 45;
    private static final int PICK_COUNT = 6;
    // C(45,6) = 8,145,060
    private static final int TOTAL_COMBINATIONS = 8_145_060;

    // Max combinations to include in a FrequencyGroup's combinations list
    private static final int MAX_COMBINATIONS_PER_GROUP = 500;

    // SSE poll interval
    private static final Duration POLL_INTERVAL = Duration.ofMillis(300);

    /**
     * Precomputed binomial coefficients C(n, k) for n: 0..44, k: 0..6
     */
    private static final long[][] C = new long[45][7];

    static {
        for (int n = 0; n < 45; n++) {
            C[n][0] = 1;
        }
        for (int n = 1; n < 45; n++) {
            for (int k = 1; k <= Math.min(n, 6); k++) {
                C[n][k] = C[n - 1][k - 1] + C[n - 1][k];
            }
        }
    }

    public Mono<LottoNumbers> generate() {
        return Mono.fromCallable(this::pickNumbers);
    }

    public Flux<LottoNumbers> generateMultiple(int count) {
        return Flux.range(0, count)
                .map(i -> pickNumbers());
    }

    public Flux<SimulationProgress> simulate(long totalCount) {
        // Shared state between simulation thread and Flux.interval poller
        int[] counts = new int[TOTAL_COMBINATIONS];
        AtomicLong currentRound = new AtomicLong(0);
        AtomicInteger uniqueCount = new AtomicInteger(0);
        AtomicBoolean done = new AtomicBoolean(false);
        AtomicLong lastReportedRound = new AtomicLong(0);

        // Start simulation in background thread
        Thread simThread = new Thread(() -> {
            ThreadLocalRandom random = ThreadLocalRandom.current();
            int[] pool = new int[MAX_NUMBER];
            for (int i = 0; i < MAX_NUMBER; i++) pool[i] = i;
            int[] swappedPositions = new int[PICK_COUNT];
            int[] picked = new int[PICK_COUNT];
            int uniqueCombinations = 0;

            for (long round = 1; round <= totalCount; round++) {
                for (int i = 0; i < PICK_COUNT; i++) {
                    int j = i + random.nextInt(MAX_NUMBER - i);
                    int tmp = pool[i];
                    pool[i] = pool[j];
                    pool[j] = tmp;
                    swappedPositions[i] = j;
                    picked[i] = pool[i];
                }
                Arrays.sort(picked);
                int idx = combinatorialIndex(picked);
                if (counts[idx] == 0) uniqueCombinations++;
                counts[idx]++;
                for (int i = PICK_COUNT - 1; i >= 0; i--) {
                    int j = swappedPositions[i];
                    int tmp = pool[i];
                    pool[i] = pool[j];
                    pool[j] = tmp;
                }

                // Update shared state periodically (every 100K to reduce contention)
                if (round % 100_000 == 0) {
                    currentRound.set(round);
                    uniqueCount.set(uniqueCombinations);
                }
            }
            currentRound.set(totalCount);
            uniqueCount.set(uniqueCombinations);
            done.set(true);
        }, "lotto-simulation");
        simThread.setDaemon(true);
        simThread.start();

        long emitInterval = Math.max(1, (long) (totalCount * 0.01)); // 1%

        return Flux.interval(POLL_INTERVAL)
                .map(tick -> {
                    long current = currentRound.get();
                    int unique = uniqueCount.get();
                    boolean completed = done.get() && current >= totalCount;

                    // Determine if we crossed a new 1% boundary since last report
                    long lastReported = lastReportedRound.get();
                    long currentAligned = (current / emitInterval) * emitInterval;
                    boolean newMilestone = currentAligned > lastReported || completed;

                    // Include distribution every 5% or when completed
                    long fivePercentInterval = Math.max(1, (long) (totalCount * 0.05));
                    boolean includeDistribution = completed ||
                            (newMilestone && currentAligned % fivePercentInterval == 0);

                    if (newMilestone) {
                        lastReportedRound.set(currentAligned);
                    }

                    return buildProgress(
                            currentAligned > 0 ? currentAligned : current,
                            totalCount, counts, unique,
                            includeDistribution, completed);
                })
                .distinctUntilChanged(SimulationProgress::currentCount)
                .takeUntil(SimulationProgress::completed);
    }

    private int combinatorialIndex(int[] picked) {
        return (int) (C[picked[0]][1] + C[picked[1]][2] + C[picked[2]][3]
                + C[picked[3]][4] + C[picked[4]][5] + C[picked[5]][6]);
    }

    private List<Integer> unrank(int index) {
        int[] result = new int[PICK_COUNT];
        int remaining = index;
        for (int k = PICK_COUNT; k >= 1; k--) {
            int n = k - 1;
            while (n + 1 < 45 && C[n + 1][k] <= remaining) {
                n++;
            }
            result[k - 1] = n;
            remaining -= C[n][k];
        }
        List<Integer> numbers = new ArrayList<>(PICK_COUNT);
        for (int v : result) {
            numbers.add(v + 1);
        }
        return numbers;
    }

    private SimulationProgress buildProgress(
            long current, long total, int[] counts, int uniqueCombinations,
            boolean fullReport, boolean completed) {

        Map<Integer, Long> freqDist = Collections.emptyMap();
        List<FrequencyGroup> allFrequencyGroups = Collections.emptyList();

        if (fullReport) {
            freqDist = buildFrequencyDistribution(counts);
        }

        if (completed) {
            Map<Integer, List<Integer>> freqToIndices = new HashMap<>();
            for (int i = 0; i < counts.length; i++) {
                int c = counts[i];
                freqToIndices.computeIfAbsent(c, k -> new ArrayList<>()).add(i);
            }
            allFrequencyGroups = buildAllFrequencyGroups(freqToIndices);
        }

        return new SimulationProgress(
                current, total, uniqueCombinations,
                freqDist, allFrequencyGroups, completed);
    }

    private Map<Integer, Long> buildFrequencyDistribution(int[] counts) {
        Map<Integer, Long> dist = new HashMap<>();
        for (int c : counts) {
            if (c > 0) {
                dist.merge(c, 1L, Long::sum);
            }
        }
        return dist;
    }

    private List<FrequencyGroup> buildAllFrequencyGroups(Map<Integer, List<Integer>> freqToIndices) {
        List<Integer> sortedFreqs = new ArrayList<>(freqToIndices.keySet());
        sortedFreqs.sort(Collections.reverseOrder());

        List<FrequencyGroup> groups = new ArrayList<>();

        for (int freq : sortedFreqs) {
            List<Integer> indices = freqToIndices.get(freq);
            int combinationCount = indices.size();

            List<List<Integer>> combinations;
            if (combinationCount <= MAX_COMBINATIONS_PER_GROUP) {
                combinations = new ArrayList<>(combinationCount);
                for (int idx : indices) {
                    combinations.add(unrank(idx));
                }
            } else {
                combinations = Collections.emptyList();
            }

            groups.add(new FrequencyGroup(freq, combinationCount, combinations));
        }

        return groups;
    }

    private LottoNumbers pickNumbers() {
        List<Integer> pool = new ArrayList<>(MAX_NUMBER);
        for (int i = MIN_NUMBER; i <= MAX_NUMBER; i++) {
            pool.add(i);
        }

        ThreadLocalRandom random = ThreadLocalRandom.current();
        for (int i = pool.size() - 1; i > pool.size() - PICK_COUNT - 1; i--) {
            int j = random.nextInt(i + 1);
            Collections.swap(pool, i, j);
        }

        List<Integer> picked = new ArrayList<>(pool.subList(pool.size() - PICK_COUNT, pool.size()));
        Collections.sort(picked);

        return new LottoNumbers(picked, LocalDateTime.now());
    }
}
