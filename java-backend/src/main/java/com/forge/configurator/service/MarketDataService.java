package com.forge.configurator.service;

import com.forge.configurator.entity.ConfiguratorComexCopperSnapshotEntity;
import com.forge.configurator.repository.ConfiguratorComexCopperSnapshotRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class MarketDataService {
    private static final Pattern[] COMEX_PATTERNS = new Pattern[]{
            Pattern.compile("Copper[^$]{0,80}\\$\\s*([0-9]+\\.[0-9]{2,4})", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\$\\s*([0-9]+\\.[0-9]{2,4})\\s*(?:USD)?\\s*/\\s*lb", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\"price\"\\s*:\\s*\"([0-9]+\\.[0-9]{2,4})\"", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\bprice\\b[^0-9]{0,20}([0-9]+\\.[0-9]{2,4})", Pattern.CASE_INSENSITIVE)
    };

    private final ConfiguratorComexCopperSnapshotRepository snapshotRepository;
    private final HttpClient httpClient;
    private final String provider;
    private final String comexUrl;
    private final Duration timeout;
    private final long cacheTtlSeconds;

    private volatile CachedPrice cache;

    public MarketDataService(ConfiguratorComexCopperSnapshotRepository snapshotRepository,
                             @Value("${app.market.provider:comexlive}") String provider,
                             @Value("${app.market.comex-url:https://comexlive.org/copper/}") String comexUrl,
                             @Value("${app.market.timeout-seconds:20}") long timeoutSeconds,
                             @Value("${app.market.cache-ttl-seconds:600}") long cacheTtlSeconds) {
        this.snapshotRepository = snapshotRepository;
        this.provider = provider == null ? "comexlive" : provider.toLowerCase();
        this.comexUrl = comexUrl;
        this.timeout = Duration.ofSeconds(Math.max(1, timeoutSeconds));
        this.cacheTtlSeconds = Math.max(5, cacheTtlSeconds);
        this.httpClient = HttpClient.newBuilder().connectTimeout(this.timeout).build();
    }

    public Map<String, Object> getCopperPrice(UUID companyId) {
        CachedPrice current = this.cache;
        Instant now = Instant.now();
        if (current != null && current.expiresAt().isAfter(now)) {
            return current.payload();
        }

        PriceInfo info;
        try {
            if ("demo".equals(provider)) {
                info = demoPrice(LocalDate.now());
            } else if ("comexlive".equals(provider)) {
                info = fetchComexLive();
            } else {
                info = demoPrice(LocalDate.now());
            }
        } catch (Exception ignored) {
            info = demoPrice(LocalDate.now());
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("price", info.price());
        payload.put("currency", "USD");
        payload.put("unit", "USD/lb");
        payload.put("source", info.source());
        payload.put("asOf", now.toString());

        this.cache = new CachedPrice(payload, now.plusSeconds(cacheTtlSeconds));

        if (companyId != null) {
            persistSnapshot(companyId, LocalDate.now(), info.price(), info.source(), now.toString());
        }

        return payload;
    }

    public Map<String, Object> getCopperPriceForDate(String date, UUID companyId) {
        LocalDate wanted = LocalDate.parse(date);
        if (companyId != null) {
            Optional<ConfiguratorComexCopperSnapshotEntity> snapshot =
                    snapshotRepository.findByCompanyIdAndCapturedOn(companyId, wanted);
            if (snapshot.isPresent()) {
                ConfiguratorComexCopperSnapshotEntity s = snapshot.get();
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("price", s.getPricePerLb() == null ? 0.0 : s.getPricePerLb().doubleValue());
                payload.put("currency", s.getCurrency() == null ? "USD" : s.getCurrency());
                payload.put("unit", "USD/lb");
                payload.put("source", s.getSource() == null ? "snapshot" : s.getSource());
                payload.put("asOf", wanted.toString());
                return payload;
            }
        }

        if (LocalDate.now().equals(wanted)) {
            return getCopperPrice(companyId);
        }

        return null;
    }

    private PriceInfo fetchComexLive() throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(comexUrl))
                .header("Accept", "text/html,application/xhtml+xml")
                .header("User-Agent", "Mozilla/5.0 (compatible; ForgeConfigurator/1.0)")
                .timeout(timeout)
                .GET()
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IllegalStateException("COMEX fetch failed with status " + response.statusCode());
        }
        Double price = extractPrice(response.body());
        if (price == null) {
            throw new IllegalStateException("Could not parse COMEX copper price");
        }
        return new PriceInfo(price, "comexlive.org");
    }

    private Double extractPrice(String html) {
        if (html == null || html.isBlank()) {
            return null;
        }
        for (Pattern pattern : COMEX_PATTERNS) {
            Matcher matcher = pattern.matcher(html);
            if (!matcher.find()) {
                continue;
            }
            try {
                double value = Double.parseDouble(matcher.group(1));
                if (value > 0 && value < 100) {
                    return value;
                }
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private PriceInfo demoPrice(LocalDate day) {
        String text = day.toString();
        long hash = 0;
        for (int i = 0; i < text.length(); i++) {
            hash = (hash * 31 + text.charAt(i)) & 0xFFFFFFFFL;
        }
        double base = 4.20;
        double jitter = (hash % 60) / 100.0;
        return new PriceInfo(round(base + jitter, 4), "demo");
    }

    private void persistSnapshot(UUID companyId,
                                 LocalDate capturedOn,
                                 double price,
                                 String source,
                                 String fetchedAt) {
        Optional<ConfiguratorComexCopperSnapshotEntity> existing =
                snapshotRepository.findByCompanyIdAndCapturedOn(companyId, capturedOn);
        if (existing.isPresent()) {
            return;
        }

        Instant now = Instant.now();
        ConfiguratorComexCopperSnapshotEntity snapshot = new ConfiguratorComexCopperSnapshotEntity();
        snapshot.setId(UUID.randomUUID());
        snapshot.setCompanyId(companyId);
        snapshot.setCapturedOn(capturedOn);
        snapshot.setPricePerLb(java.math.BigDecimal.valueOf(price));
        snapshot.setCurrency("USD");
        snapshot.setSource(source);
        snapshot.setRawPayload(Map.of("fetched_at", fetchedAt));
        snapshot.setCreatedAt(now);
        snapshot.setUpdatedAt(now);
        snapshotRepository.save(snapshot);
    }

    private double round(double value, int digits) {
        double factor = Math.pow(10, digits);
        return Math.round(value * factor) / factor;
    }

    private record CachedPrice(Map<String, Object> payload, Instant expiresAt) {
    }

    private record PriceInfo(double price, String source) {
    }
}
