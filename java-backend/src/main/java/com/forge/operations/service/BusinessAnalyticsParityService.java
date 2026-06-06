package com.forge.operations.service;

import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.ClientEntity;
import com.forge.operations.entity.EstimateEntity;
import com.forge.operations.entity.ProjectAnalyticsEntity;
import com.forge.operations.entity.WorkOrderEntity;
import com.forge.operations.repository.ClientRepository;
import com.forge.operations.repository.EstimateRepository;
import com.forge.operations.repository.ProjectAnalyticsRepository;
import com.forge.operations.repository.WorkOrderRepository;
import com.forge.shared.security.AuthenticatedUser;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class BusinessAnalyticsParityService {

    private final ProjectRepository projectRepo;
    private final EstimateRepository estimateRepo;
    private final ProjectAnalyticsRepository analyticsRepo;
    private final ClientRepository clientRepo;
    private final WorkOrderRepository workOrderRepo;
    private final OperationAccessPolicy accessPolicy;

    public BusinessAnalyticsParityService(ProjectRepository projectRepo,
                                          EstimateRepository estimateRepo,
                                          ProjectAnalyticsRepository analyticsRepo,
                                          ClientRepository clientRepo,
                                          WorkOrderRepository workOrderRepo,
                                          OperationAccessPolicy accessPolicy) {
        this.projectRepo = projectRepo;
        this.estimateRepo = estimateRepo;
        this.analyticsRepo = analyticsRepo;
        this.clientRepo = clientRepo;
        this.workOrderRepo = workOrderRepo;
        this.accessPolicy = accessPolicy;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC API METHODS
    // ═══════════════════════════════════════════════════════════════════════

    public Map<String, Object> getDashboard(String period, String from, String to, AuthenticatedUser user) {
        DateBounds bounds = resolveBounds(period, from, to);
        UUID companyId = accessPolicy.resolveCompanyScope(user);

        List<ProjectEntity> projects = findProjects(companyId, bounds.from(), bounds.to());
        ProjectData data = loadProjectData(projects);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("kpis", computeKPIs(projects, data));
        result.put("revenueTrend", computeRevenueTrend(projects, data));
        result.put("profitVsCost", computeProfitVsCost(projects, data));
        result.put("orderPipeline", computeOrderPipeline(projects));
        result.put("topCustomers", computeTopCustomers(projects, data, 10));
        result.put("recentOrders", computeRecentOrders(projects, data, 20));
        result.put("workflowAnalytics", computeWorkflowAnalytics(projects, data));
        result.put("productAnalytics", computeProductAnalytics(projects, data));
        result.put("operationalAnalytics", computeOperationalAnalytics(projects, data));
        return result;
    }

    public Map<String, Object> getKPIs(String period, String from, String to, AuthenticatedUser user) {
        DateBounds bounds = resolveBounds(period, from, to);
        UUID companyId = accessPolicy.resolveCompanyScope(user);
        List<ProjectEntity> projects = findProjects(companyId, bounds.from(), bounds.to());
        ProjectData data = loadProjectData(projects);
        return computeKPIs(projects, data);
    }

    public List<Map<String, Object>> getRevenueTrend(String period, String from, String to, AuthenticatedUser user) {
        DateBounds bounds = resolveBounds(period, from, to);
        UUID companyId = accessPolicy.resolveCompanyScope(user);
        List<ProjectEntity> projects = findProjects(companyId, bounds.from(), bounds.to());
        ProjectData data = loadProjectData(projects);
        return computeRevenueTrend(projects, data);
    }

    public List<Map<String, Object>> getProfitVsCost(String period, String from, String to, AuthenticatedUser user) {
        DateBounds bounds = resolveBounds(period, from, to);
        UUID companyId = accessPolicy.resolveCompanyScope(user);
        List<ProjectEntity> projects = findProjects(companyId, bounds.from(), bounds.to());
        ProjectData data = loadProjectData(projects);
        return computeProfitVsCost(projects, data);
    }

    public List<Map<String, Object>> getOrderPipeline(String period, String from, String to, AuthenticatedUser user) {
        DateBounds bounds = resolveBounds(period, from, to);
        UUID companyId = accessPolicy.resolveCompanyScope(user);
        List<ProjectEntity> projects = findProjects(companyId, bounds.from(), bounds.to());
        return computeOrderPipeline(projects);
    }

    public List<Map<String, Object>> getTopCustomers(String period, String from, String to, int limit, AuthenticatedUser user) {
        DateBounds bounds = resolveBounds(period, from, to);
        UUID companyId = accessPolicy.resolveCompanyScope(user);
        List<ProjectEntity> projects = findProjects(companyId, bounds.from(), bounds.to());
        ProjectData data = loadProjectData(projects);
        return computeTopCustomers(projects, data, limit);
    }

    public List<Map<String, Object>> getRecentOrders(String period, String from, String to, int limit, AuthenticatedUser user) {
        DateBounds bounds = resolveBounds(period, from, to);
        UUID companyId = accessPolicy.resolveCompanyScope(user);
        List<ProjectEntity> projects = findProjects(companyId, bounds.from(), bounds.to());
        ProjectData data = loadProjectData(projects);
        return computeRecentOrders(projects, data, limit);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE COMPUTATION METHODS
    // ═══════════════════════════════════════════════════════════════════════

    private Map<String, Object> computeKPIs(List<ProjectEntity> projects, ProjectData data) {
        double totalRevenue = 0, totalCost = 0, rawMaterialCost = 0, processCost = 0, overheadCost = 0;
        double marginSum = 0;
        int marginCount = 0;
        int activeProjects = 0, completedOrders = 0, pendingOrders = 0, inProduction = 0, deliveredOrders = 0;
        int pendingWorkOrders = 0;
        int totalProjects = projects.size();

        for (ProjectEntity p : projects) {
            EstimateEntity latest = latestEstimate(data.estimatesByProject().getOrDefault(p.getId(), List.of()));
            double rev = latest != null && latest.getFinalPrice() != null ? latest.getFinalPrice().doubleValue() : 0;
            totalRevenue += rev;

            double projectMfgCost = data.analyticsByProject().getOrDefault(p.getId(), List.of())
                    .stream().mapToDouble(a -> a.getMfgCost() != null ? a.getMfgCost() : 0).sum();
            totalCost += projectMfgCost;

            if (latest != null) {
                rawMaterialCost += latest.getRawMaterialCost() != null ? latest.getRawMaterialCost().doubleValue() : 0;
                processCost += latest.getProcessCost() != null ? latest.getProcessCost().doubleValue() : 0;
                overheadCost += latest.getOverheadCost() != null ? latest.getOverheadCost().doubleValue() : 0;
            }

            if (rev > 0 && projectMfgCost > 0) {
                marginSum += ((rev - projectMfgCost) / rev) * 100;
                marginCount++;
            }

            String status = p.getStatus();
            if (status == null) status = "";
            if (List.of("draft", "estimated", "quoted").contains(status)) pendingOrders++;
            if (List.of("order_confirmed", "in_production", "inspected").contains(status)) activeProjects++;
            if ("in_production".equals(status)) inProduction++;
            if ("shipped".equals(status)) deliveredOrders++;
            if (List.of("shipped", "closed").contains(status)) completedOrders++;

            WorkOrderEntity wo = data.workOrderByProject().get(p.getId());
            if (wo != null && "pending".equals(wo.getStatus())) pendingWorkOrders++;
        }

        double totalProfit = totalRevenue - totalCost;
        double avgMargin = marginCount > 0 ? marginSum / marginCount
                : (totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("totalRevenue", round2(totalRevenue));
        m.put("totalCost", round2(totalCost));
        m.put("totalProfit", round2(totalProfit));
        m.put("avgMargin", round2(avgMargin));
        m.put("rawMaterialCost", round2(rawMaterialCost));
        m.put("processCost", round2(processCost));
        m.put("overheadCost", round2(overheadCost));
        m.put("totalProjects", totalProjects);
        m.put("activeProjects", activeProjects);
        m.put("completedOrders", completedOrders);
        m.put("pendingOrders", pendingOrders);
        m.put("inProduction", inProduction);
        m.put("deliveredOrders", deliveredOrders);
        m.put("pendingWorkOrders", pendingWorkOrders);
        return m;
    }

    private List<Map<String, Object>> computeRevenueTrend(List<ProjectEntity> projects, ProjectData data) {
        Map<String, double[]> monthMap = new LinkedHashMap<>(); // [revenue, cost, profit]

        List<ProjectEntity> sorted = projects.stream()
                .sorted(Comparator.comparing(p -> p.getCreatedAt() != null ? p.getCreatedAt() : Instant.EPOCH))
                .toList();

        for (ProjectEntity p : sorted) {
            if (p.getCreatedAt() == null) continue;
            String month = p.getCreatedAt().toString().substring(0, 7); // YYYY-MM
            EstimateEntity latest = latestEstimate(data.estimatesByProject().getOrDefault(p.getId(), List.of()));
            double rev = latest != null && latest.getFinalPrice() != null ? latest.getFinalPrice().doubleValue() : 0;
            double cost = data.analyticsByProject().getOrDefault(p.getId(), List.of())
                    .stream().mapToDouble(a -> a.getMfgCost() != null ? a.getMfgCost() : 0).sum();
            monthMap.computeIfAbsent(month, k -> new double[3]);
            monthMap.get(month)[0] += rev;
            monthMap.get(month)[1] += cost;
            monthMap.get(month)[2] += (rev - cost);
        }

        return monthMap.entrySet().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("month", e.getKey());
            m.put("revenue", round2(e.getValue()[0]));
            m.put("cost", round2(e.getValue()[1]));
            m.put("profit", round2(e.getValue()[2]));
            return m;
        }).toList();
    }

    private List<Map<String, Object>> computeProfitVsCost(List<ProjectEntity> projects, ProjectData data) {
        Map<String, double[]> monthMap = new LinkedHashMap<>(); // [rev, cost, profit, rawMat, proc, overhead]

        List<ProjectEntity> sorted = projects.stream()
                .sorted(Comparator.comparing(p -> p.getCreatedAt() != null ? p.getCreatedAt() : Instant.EPOCH))
                .toList();

        for (ProjectEntity p : sorted) {
            if (p.getCreatedAt() == null) continue;
            String month = p.getCreatedAt().toString().substring(0, 7);
            EstimateEntity latest = latestEstimate(data.estimatesByProject().getOrDefault(p.getId(), List.of()));
            double rev = latest != null && latest.getFinalPrice() != null ? latest.getFinalPrice().doubleValue() : 0;
            double cost = data.analyticsByProject().getOrDefault(p.getId(), List.of())
                    .stream().mapToDouble(a -> a.getMfgCost() != null ? a.getMfgCost() : 0).sum();
            double rawMat = latest != null && latest.getRawMaterialCost() != null ? latest.getRawMaterialCost().doubleValue() : 0;
            double proc = latest != null && latest.getProcessCost() != null ? latest.getProcessCost().doubleValue() : 0;
            double overhead = latest != null && latest.getOverheadCost() != null ? latest.getOverheadCost().doubleValue() : 0;

            monthMap.computeIfAbsent(month, k -> new double[6]);
            double[] vals = monthMap.get(month);
            vals[0] += rev; vals[1] += cost; vals[2] += (rev - cost);
            vals[3] += rawMat; vals[4] += proc; vals[5] += overhead;
        }

        return monthMap.entrySet().stream().map(e -> {
            double[] v = e.getValue();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("month", e.getKey());
            m.put("revenue", round2(v[0]));
            m.put("cost", round2(v[1]));
            m.put("profit", round2(v[2]));
            m.put("rawMaterial", round2(v[3]));
            m.put("process", round2(v[4]));
            m.put("overhead", round2(v[5]));
            return m;
        }).toList();
    }

    private List<Map<String, Object>> computeOrderPipeline(List<ProjectEntity> projects) {
        Map<String, Long> byStatus = projects.stream()
                .filter(p -> p.getStatus() != null)
                .collect(Collectors.groupingBy(ProjectEntity::getStatus, Collectors.counting()));
        return byStatus.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("status", e.getKey());
                    m.put("count", e.getValue().intValue());
                    return m;
                }).toList();
    }

    private List<Map<String, Object>> computeTopCustomers(List<ProjectEntity> projects, ProjectData data, int limit) {
        record CustomerAgg(String name, double revenue, double cost, int orderCount) {}

        Map<UUID, double[]> customerMap = new LinkedHashMap<>(); // clientId → [revenue, cost, orderCount]
        Map<UUID, String> clientNames = new LinkedHashMap<>();

        for (ProjectEntity p : projects) {
            UUID clientId = p.getClientId() != null ? p.getClientId() : UUID.fromString("00000000-0000-0000-0000-000000000000");
            EstimateEntity latest = latestEstimate(data.estimatesByProject().getOrDefault(p.getId(), List.of()));
            double rev = latest != null && latest.getFinalPrice() != null ? latest.getFinalPrice().doubleValue() : 0;
            double cost = data.analyticsByProject().getOrDefault(p.getId(), List.of())
                    .stream().mapToDouble(a -> a.getMfgCost() != null ? a.getMfgCost() : 0).sum();

            customerMap.computeIfAbsent(clientId, k -> new double[3]);
            customerMap.get(clientId)[0] += rev;
            customerMap.get(clientId)[1] += cost;
            customerMap.get(clientId)[2]++;

            if (!clientNames.containsKey(clientId) && p.getClientId() != null) {
                clientNames.put(clientId, data.clientsById().containsKey(clientId)
                        ? data.clientsById().get(clientId).getClientName()
                        : "Unknown");
            }
            if (!clientNames.containsKey(clientId)) clientNames.put(clientId, "Unknown");
        }

        return customerMap.entrySet().stream()
                .sorted((a, b) -> Double.compare(b.getValue()[0], a.getValue()[0]))
                .limit(limit)
                .map(e -> {
                    double[] v = e.getValue();
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("customer", clientNames.getOrDefault(e.getKey(), "Unknown"));
                    m.put("revenue", round2(v[0]));
                    m.put("profit", round2(v[0] - v[1]));
                    m.put("orderCount", (int) v[2]);
                    return m;
                }).toList();
    }

    private List<Map<String, Object>> computeRecentOrders(List<ProjectEntity> projects, ProjectData data, int limit) {
        return projects.stream()
                .sorted(Comparator.comparing((ProjectEntity p) -> p.getUpdatedAt() != null ? p.getUpdatedAt() : Instant.EPOCH).reversed())
                .limit(limit)
                .map(p -> {
                    EstimateEntity latest = latestEstimate(data.estimatesByProject().getOrDefault(p.getId(), List.of()));
                    double revenue = latest != null && latest.getFinalPrice() != null ? latest.getFinalPrice().doubleValue() : 0;
                    List<ProjectAnalyticsEntity> analyticsRows = data.analyticsByProject().getOrDefault(p.getId(), List.of());
                    boolean hasActualCost = analyticsRows.stream().anyMatch(a -> a.getMfgCost() != null && a.getMfgCost() != 0);
                    double mfgCost = analyticsRows.stream().mapToDouble(a -> a.getMfgCost() != null ? a.getMfgCost() : 0).sum();

                    String clientName = "Unknown";
                    if (p.getClientId() != null && data.clientsById().containsKey(p.getClientId())) {
                        clientName = data.clientsById().get(p.getClientId()).getClientName();
                        if (clientName == null) clientName = "Unknown";
                    }

                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", p.getId());
                    m.put("project_name", p.getProjectName());
                    m.put("customer", clientName);
                    m.put("revenue", round2(revenue));
                    m.put("mfg_cost", hasActualCost ? round2(mfgCost) : null);
                    m.put("profit", hasActualCost ? round2(revenue - mfgCost) : null);
                    m.put("cost_data_pending", !hasActualCost);
                    m.put("status", p.getStatus());
                    m.put("updated_at", p.getUpdatedAt());
                    return m;
                }).toList();
    }

    private Map<String, Object> computeWorkflowAnalytics(List<ProjectEntity> projects, ProjectData data) {
        List<Map<String, Object>> stages = new ArrayList<>();
        String[] stageKeys = {"project_info", "estimation", "quotation", "po_from_client", "work_order", "production", "quality", "logistics", "invoice"};
        String[] stageLabels = {"Project Info", "Estimation", "Quotation", "PO from Client", "Work Order", "Production", "Quality", "Logistics", "Invoice"};
        int[] stageCounts = new int[stageKeys.length];

        for (ProjectEntity p : projects) {
            String status = p.getStatus() != null ? p.getStatus() : "";
            WorkOrderEntity wo = data.workOrderByProject().get(p.getId());
            switch (status) {
                case "draft" -> stageCounts[0]++;
                case "estimated" -> stageCounts[1]++;
                case "quoted" -> stageCounts[2]++;
                case "order_confirmed" -> { if (wo != null) stageCounts[4]++; else stageCounts[3]++; }
                case "in_production" -> stageCounts[5]++;
                case "inspected" -> stageCounts[6]++;
                case "shipped" -> stageCounts[7]++;
                case "closed" -> stageCounts[8]++;
            }
        }

        double avgPerStage = projects.isEmpty() ? 1.0 : (double) projects.size() / stageKeys.length;
        List<String> bottlenecks = new ArrayList<>();
        for (int i = 0; i < stageKeys.length; i++) {
            Map<String, Object> stage = new LinkedHashMap<>();
            stage.put("key", stageKeys[i]);
            stage.put("label", stageLabels[i]);
            stage.put("count", stageCounts[i]);
            stages.add(stage);
            if (stageCounts[i] > avgPerStage * 1.5 && stageCounts[i] >= 2) bottlenecks.add(stageKeys[i]);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("stages", stages);
        result.put("bottlenecks", bottlenecks);
        result.put("totalProjects", projects.size());
        return result;
    }

    private Map<String, Object> computeProductAnalytics(List<ProjectEntity> projects, ProjectData data) {
        Map<String, double[]> partMap = new LinkedHashMap<>(); // name → [totalQty, revenue, profit, orderCount]
        Map<String, double[]> materialMap = new LinkedHashMap<>(); // material → [count, totalQty]

        for (ProjectEntity p : projects) {
            EstimateEntity latest = latestEstimate(data.estimatesByProject().getOrDefault(p.getId(), List.of()));
            double rev = latest != null && latest.getFinalPrice() != null ? latest.getFinalPrice().doubleValue() : 0;
            double cost = latest != null && latest.getTotalCost() != null ? latest.getTotalCost().doubleValue() : 0;
            int qty = p.getQuantity() != null ? p.getQuantity() : 1;
            String name = p.getProjectName() != null ? p.getProjectName() : "Unknown Part";

            partMap.computeIfAbsent(name, k -> new double[4]);
            double[] pv = partMap.get(name);
            pv[0] += qty; pv[1] += rev; pv[2] += (rev - cost); pv[3]++;

            String mat = java.util.stream.Stream.of(p.getMaterialType(), p.getMaterialGrade())
                    .filter(s -> s != null && !s.isBlank()).collect(Collectors.joining(" ")).trim();
            if (!mat.isBlank()) {
                materialMap.computeIfAbsent(mat, k -> new double[2]);
                materialMap.get(mat)[0]++;
                materialMap.get(mat)[1] += qty;
            }
        }

        List<Map<String, Object>> mostProduced = partMap.entrySet().stream()
                .sorted((a, b) -> Double.compare(b.getValue()[0], a.getValue()[0]))
                .limit(8).map(e -> partToMap(e.getKey(), e.getValue())).toList();

        List<Map<String, Object>> mostProfitable = partMap.entrySet().stream()
                .sorted((a, b) -> Double.compare(b.getValue()[2], a.getValue()[2]))
                .limit(8).map(e -> partToMap(e.getKey(), e.getValue())).toList();

        List<Map<String, Object>> topMaterials = materialMap.entrySet().stream()
                .sorted((a, b) -> Double.compare(b.getValue()[0], a.getValue()[0]))
                .limit(8).map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("material", e.getKey());
                    m.put("count", (int) e.getValue()[0]);
                    m.put("totalQty", (int) e.getValue()[1]);
                    return m;
                }).toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("mostProduced", mostProduced);
        result.put("mostProfitable", mostProfitable);
        result.put("topMaterials", topMaterials);
        return result;
    }

    private Map<String, Object> computeOperationalAnalytics(List<ProjectEntity> projects, ProjectData data) {
        long totalProductionDays = 0; int productionCount = 0;
        long totalDeliveryDays = 0; int deliveryCount = 0;
        int pendingWorkOrders = 0, completedWorkOrders = 0, inProgressWorkOrders = 0, overdueOrders = 0;
        Instant now = Instant.now();

        for (ProjectEntity p : projects) {
            WorkOrderEntity wo = data.workOrderByProject().get(p.getId());
            if (wo != null) {
                String woStatus = wo.getStatus() != null ? wo.getStatus() : "";
                if ("pending".equals(woStatus)) pendingWorkOrders++;
                else if ("in_progress".equals(woStatus)) inProgressWorkOrders++;
                else if ("completed".equals(woStatus)) completedWorkOrders++;

                String pStatus = p.getStatus() != null ? p.getStatus() : "";
                if (List.of("shipped", "closed").contains(pStatus) && wo.getCreatedAt() != null && p.getUpdatedAt() != null) {
                    long days = (p.getUpdatedAt().toEpochMilli() - wo.getCreatedAt().toEpochMilli()) / 86_400_000L;
                    if (days > 0 && days < 365) { totalProductionDays += days; productionCount++; }
                }
                if (wo.getTargetDate() != null && !"completed".equals(wo.getStatus()) && wo.getTargetDate().isBefore(now)) {
                    overdueOrders++;
                }
            }

            String pStatus = p.getStatus() != null ? p.getStatus() : "";
            if (List.of("shipped", "closed").contains(pStatus) && p.getCreatedAt() != null && p.getUpdatedAt() != null) {
                long days = (p.getUpdatedAt().toEpochMilli() - p.getCreatedAt().toEpochMilli()) / 86_400_000L;
                if (days > 0 && days < 365) { totalDeliveryDays += days; deliveryCount++; }
            }
        }

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("avgProductionDays", productionCount > 0 ? (int) (totalProductionDays / productionCount) : 0);
        m.put("avgDeliveryDays", deliveryCount > 0 ? (int) (totalDeliveryDays / deliveryCount) : 0);
        m.put("pendingWorkOrders", pendingWorkOrders);
        m.put("inProgressWorkOrders", inProgressWorkOrders);
        m.put("completedWorkOrders", completedWorkOrders);
        m.put("overdueOrders", overdueOrders);
        return m;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DATA LOADING HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    private record ProjectData(
            Map<UUID, List<EstimateEntity>> estimatesByProject,
            Map<UUID, List<ProjectAnalyticsEntity>> analyticsByProject,
            Map<UUID, ClientEntity> clientsById,
            Map<UUID, WorkOrderEntity> workOrderByProject
    ) {}

    private ProjectData loadProjectData(List<ProjectEntity> projects) {
        if (projects.isEmpty()) {
            return new ProjectData(Map.of(), Map.of(), Map.of(), Map.of());
        }

        List<UUID> projectIds = projects.stream().map(ProjectEntity::getId).toList();

        // Batch load estimates
        Map<UUID, List<EstimateEntity>> estimatesByProject = estimateRepo.findByProjectIdIn(projectIds)
                .stream().collect(Collectors.groupingBy(EstimateEntity::getProjectId));

        // Batch load analytics
        Map<UUID, List<ProjectAnalyticsEntity>> analyticsByProject = analyticsRepo.findByProjectIdIn(projectIds)
                .stream().collect(Collectors.groupingBy(ProjectAnalyticsEntity::getProjectId));

        // Batch load clients
        List<UUID> clientIds = projects.stream()
                .map(ProjectEntity::getClientId)
                .filter(id -> id != null)
                .distinct().toList();
        Map<UUID, ClientEntity> clientsById = clientRepo.findAllById(clientIds)
                .stream().collect(Collectors.toMap(ClientEntity::getId, Function.identity()));

        // Batch load work orders (one per project — take latest)
        Map<UUID, WorkOrderEntity> workOrderByProject = workOrderRepo.findByProjectIdIn(projectIds)
                .stream().collect(Collectors.toMap(WorkOrderEntity::getProjectId, w -> w,
                        (a, b) -> a.getCreatedAt() != null && b.getCreatedAt() != null
                                && b.getCreatedAt().isAfter(a.getCreatedAt()) ? b : a));

        return new ProjectData(estimatesByProject, analyticsByProject, clientsById, workOrderByProject);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DATE BOUNDS HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    private record DateBounds(Instant from, Instant to) {}

    private DateBounds resolveBounds(String period, String from, String to) {
        if (period == null || period.isBlank() || "all".equals(period)) {
            if ("custom".equals(period) && from != null && to != null) {
                return customBounds(from, to);
            }
            return new DateBounds(null, null);
        }
        if ("custom".equals(period) && from != null && to != null) {
            return customBounds(from, to);
        }

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        return switch (period) {
            case "today" -> new DateBounds(
                    today.atStartOfDay(ZoneOffset.UTC).toInstant(),
                    today.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant());
            case "this_week" -> {
                LocalDate weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
                yield new DateBounds(
                        weekStart.atStartOfDay(ZoneOffset.UTC).toInstant(),
                        null);
            }
            case "this_month" -> new DateBounds(
                    today.withDayOfMonth(1).atStartOfDay(ZoneOffset.UTC).toInstant(),
                    null);
            case "this_year" -> new DateBounds(
                    today.withDayOfYear(1).atStartOfDay(ZoneOffset.UTC).toInstant(),
                    null);
            default -> new DateBounds(null, null);
        };
    }

    private DateBounds customBounds(String from, String to) {
        try {
            Instant f = LocalDate.parse(from).atStartOfDay(ZoneOffset.UTC).toInstant();
            Instant t = LocalDate.parse(to).plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
            return new DateBounds(f, t);
        } catch (Exception e) {
            return new DateBounds(null, null);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SMALL HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    private List<ProjectEntity> findProjects(UUID companyId, Instant from, Instant to) {
        Specification<ProjectEntity> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isNull(root.get("deletedAt")));
            if (companyId != null) predicates.add(cb.equal(root.get("companyId"), companyId));
            if (from != null) predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from));
            if (to != null) predicates.add(cb.lessThanOrEqualTo(root.get("createdAt"), to));
            query.orderBy(cb.desc(root.get("updatedAt")));
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        return projectRepo.findAll(spec);
    }

    private EstimateEntity latestEstimate(List<EstimateEntity> estimates) {
        if (estimates == null || estimates.isEmpty()) return null;
        return estimates.stream()
                .max(Comparator.comparingInt(e -> e.getRevision() != null ? e.getRevision() : 0))
                .orElse(null);
    }

    private double round2(double v) { return Math.round(v * 100.0) / 100.0; }

    private Map<String, Object> partToMap(String name, double[] v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("totalQty", (int) v[0]);
        m.put("revenue", round2(v[1]));
        m.put("profit", round2(v[2]));
        m.put("orderCount", (int) v[3]);
        return m;
    }

}
