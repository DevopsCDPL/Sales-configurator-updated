package com.forge.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record ContactAdminRequest(
        @Email @NotBlank String email
) {
}
