package com.forge.operations.api;

import com.forge.operations.service.BusinessAnalyticsParityService;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/business-analytics")
public class BusinessAnalyticsController {

    private final BusinessAnalyticsParityService svc;
    private final OperationAccessPolicy accessPolicy;

    public BusinessAnalyticsController(BusinessAnalyticsParityService svc,
                                       OperationAccessPolicy accessPolicy) {
        this.svc = svc;
        this.accessPolicy = accessPolicy;
    }

    @GetMapping("/dashboard")
    public ResponseEntity<?> getDashboard(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getDashboard(period, from, to, user)));
    }

    @GetMapping("/kpis")
    public ResponseEntity<?> getKPIs(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getKPIs(period, from, to, user)));
    }

    @GetMapping("/revenue-trend")
    public ResponseEntity<?> getRevenueTrend(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getRevenueTrend(period, from, to, user)));
    }

    @GetMapping("/profit-vs-cost")
    public ResponseEntity<?> getProfitVsCost(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getProfitVsCost(period, from, to, user)));
    }

    @GetMapping("/order-pipeline")
    public ResponseEntity<?> getOrderPipeline(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getOrderPipeline(period, from, to, user)));
    }

    @GetMapping("/top-customers")
    public ResponseEntity<?> getTopCustomers(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false, defaultValue = "10") int limit,
            Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getTopCustomers(period, from, to, limit, user)));
    }

    @GetMapping("/recent-orders")
    public ResponseEntity<?> getRecentOrders(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false, defaultValue = "20") int limit,
            Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getRecentOrders(period, from, to, limit, user)));
    }

    @GetMapping("/export-excel")
    public ResponseEntity<?> exportExcel(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.status(501).body(ApiEnvelope.error("Excel export not yet implemented"));
    }
}
