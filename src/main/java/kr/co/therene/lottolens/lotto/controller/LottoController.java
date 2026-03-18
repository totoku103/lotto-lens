package kr.co.therene.lottolens.lotto.controller;

import kr.co.therene.lottolens.lotto.dto.LottoNumbers;
import kr.co.therene.lottolens.lotto.dto.SimulationProgress;
import kr.co.therene.lottolens.lotto.service.LottoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/lotto")
@RequiredArgsConstructor
public class LottoController {

    private static final long MAX_SIMULATE_COUNT = 150_000_000L;

    private final LottoService lottoService;

    @GetMapping("/generate")
    public Flux<LottoNumbers> generate(
            @RequestParam(value = "count", defaultValue = "1") int count
    ) {
        if (count <= 1) {
            return lottoService.generate().flux();
        }
        return lottoService.generateMultiple(count);
    }

    @GetMapping(value = "/simulate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<SimulationProgress> simulate(
            @RequestParam(value = "count", defaultValue = "150000000") long count
    ) {
        long safeCount = Math.min(count, MAX_SIMULATE_COUNT);
        return lottoService.simulate(safeCount);
    }
}
