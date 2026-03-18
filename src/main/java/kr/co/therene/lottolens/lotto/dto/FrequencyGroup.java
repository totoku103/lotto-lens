package kr.co.therene.lottolens.lotto.dto;

import java.util.List;

public record FrequencyGroup(
    int frequency,                    // 출현 횟수 (예: 45)
    int combinationCount,             // 이 횟수로 나온 조합 수
    List<List<Integer>> combinations  // 실제 조합들 (combinationCount <= 500이면 포함, 아니면 빈 리스트)
) {}
