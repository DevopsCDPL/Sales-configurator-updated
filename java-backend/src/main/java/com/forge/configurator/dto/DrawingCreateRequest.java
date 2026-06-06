package com.forge.configurator.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record DrawingCreateRequest(
        @NotBlank @Size(min = 1, max = 200) String folderName,
        @NotNull @Min(1) @Max(20) Integer panelCount,
        @NotBlank String circuitBreakerBrand
) {
}
