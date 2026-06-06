package com.forge.operations.api;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.SystemSettingService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;


@RestController
@RequestMapping("api/settings")
public class SettingsParityController {
    
    private final SystemSettingService systemSettingService;
    private final OperationAccessPolicy accessPolicy;

    public SettingsParityController(SystemSettingService systemSettingService,
                                    OperationAccessPolicy accessPolicy
    ) {
        this.systemSettingService = systemSettingService;
        this.accessPolicy = accessPolicy;
    }

    @GetMapping("/system")
    public ResponseEntity<?> getSystem (Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        var settings = systemSettingService.getSystemSettings(user.companyId());
        return ResponseEntity.ok(ApiEnvelope.success(settings));
    }
    
}
