package com.forge.operations.service;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.forge.auth.repository.SettingRepository;

@Service
public class SystemSettingService {
    
    private static final Map<String, Object> DEFAULTS = Map.of(
        "projectNumberPrefix",    "PRJ",
        "soNumberPrefix",         "SO",
        "woNumberPrefix",         "WO",
        "defaultMargin",          15,
        "defaultPaymentTerms",    "Net 30",
        "quotationValidity",      30,
        "workOrderQualityReqs",   "",
        "woPreparedByNames",      "",
        "woApprovedByNames",      "",
        "productionInspectorInitials", ""
    );

    private final SettingRepository settingRepository;

    public SystemSettingService(SettingRepository settingRepository) {
        this.settingRepository = settingRepository;
    }

    public Map<String, Object> getSystemSettings(UUID companyId) {
        var row = companyId != null
            ? settingRepository.findByKeyAndCompanyId("system", companyId)
            : settingRepository.findByKeyAndCompanyIdIsNull("system");

        Map<String, Object> result = new HashMap<>(DEFAULTS);
        row.ifPresent(setting -> result.putAll(setting.getValue()));
        return result;
    }
}
