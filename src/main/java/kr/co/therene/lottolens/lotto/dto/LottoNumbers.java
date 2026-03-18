package kr.co.therene.lottolens.lotto.dto;

import java.time.LocalDateTime;
import java.util.List;

public record LottoNumbers(
        List<Integer> numbers,
        LocalDateTime generatedAt
) {
}
