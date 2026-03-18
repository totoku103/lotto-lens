package kr.co.therene.lottolens.lotto.dto;

import java.util.List;
import java.util.Map;

public record SimulationProgress(
        long currentCount,
        long totalCount,
        int uniqueCombinations,
        Map<Integer, Long> frequencyDistribution,
        List<FrequencyGroup> allFrequencyGroups,
        boolean completed
) {
}
