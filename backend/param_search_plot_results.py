import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# Set academic paper style
plt.rcParams.update({
    "font.family": "serif",
    "font.size": 10,
    "axes.labelsize": 11,
    "axes.titlesize": 12,
    "xtick.labelsize": 9,
    "ytick.labelsize": 9,
    "legend.fontsize": 9,
    "grid.alpha": 0.25,
    "grid.linestyle": "--",
    "figure.constrained_layout.use": True
})

# Read CSV data
df = pd.read_csv("parameter_search_results.csv")

# Create figure
fig, ax = plt.subplots(figsize=(6, 4.2), dpi=300)

# Curated, professional academic color palette
colors = ["#0c4a6e", "#dd5e3b", "#0f766e", "#be123c", "#6d28d9"]

# Group by log to plot one curve per log
for i, (log_name, group) in enumerate(df.groupby("log")):
    # 1. Identify baseline memory (where max_inactive == total_events)
    baseline_row = group[group["max_inactive"] == group["total_events"]]
    if baseline_row.empty:
        baseline_row = group.loc[group["max_inactive"].idxmax()]
    
    baseline_mem = baseline_row["total_mem_bytes"].values[0]
    
    # 2. Calculate Memory Savings (%)
    group = group.copy()
    group["memory_savings"] = (1 - group["total_mem_bytes"] / baseline_mem) * 100
    
    # 3. Extract the Pareto Frontier (Maximizing both Memory Savings and F1 Score)
    desc_group = group.sort_values(by="memory_savings", ascending=False)
    current_max_f1 = -1.0
    pareto_points = []
    
    for _, row in desc_group.iterrows():
        if row["f1_score"] >= current_max_f1:
            current_max_f1 = row["f1_score"]
            pareto_points.append(row)
            
    pareto_df = pd.DataFrame(pareto_points).sort_values("memory_savings")
    
    color = colors[i % len(colors)]
    
    # Plot all scanned points as a light scatter plot to show the search space
    ax.scatter(
        group["memory_savings"],
        group["f1_score"],
        color=color,
        alpha=0.12,
        s=15,
        edgecolors='none',
        label=f"{log_name} (Search Space)" if len(df["log"].unique()) == 1 else None
    )
    
    # Plot Pareto frontier line
    ax.plot(
        pareto_df["memory_savings"],
        pareto_df["f1_score"],
        marker="o",
        markersize=5,
        linewidth=2,
        color=color,
        label=f"{log_name} (Pareto Frontier)"
    )
    
    # Highlight the absolute Sweet Spot (Max accuracy with maximum savings)
    sweet_spot = pareto_df[pareto_df["f1_score"] >= 0.9999].iloc[0]
    ax.plot(
        sweet_spot["memory_savings"],
        sweet_spot["f1_score"],
        marker="*",
        markersize=12,
        color="#eab308",
        markeredgecolor="#854d0e",
        markeredgewidth=1,
        label="Optimal Sweet Spot (F1=1.0)" if i == 0 else None,
        zorder=5
    )
    
    # Annotate the Sweet Spot values
    ax.annotate(
        f"Savings: {sweet_spot['memory_savings']:.1f}%\nActive Objs: {int(sweet_spot['active_objs'])}",
        xy=(sweet_spot['memory_savings'], sweet_spot['f1_score']),
        xytext=(sweet_spot['memory_savings'] - 18, sweet_spot['f1_score'] - 0.22),
        arrowprops=dict(arrowstyle="->", color="#854d0e", lw=1, connectionstyle="arc3,rad=-0.1"),
        fontsize=8.5,
        fontweight="bold",
        color="#854d0e",
        bbox=dict(boxstyle="round,pad=0.3", fc="#fef9c3", ec="#fef08a", alpha=0.9)
    )

# Decoration
ax.set_xlabel("Memory Savings (%)")
ax.set_ylabel("Discovery Accuracy (F1 Score)")
ax.set_title("Memory-Accuracy Pareto Frontier of Online Stream Miner")
ax.set_xlim(-5, 105)
ax.set_ylim(-0.05, 1.1)
ax.grid(True)
ax.legend(loc="lower left", frameon=True, facecolor="white", edgecolor="none")

# Style Spines
for spine in ["top", "right"]:
    ax.spines[spine].set_visible(False)
ax.spines["left"].set_position(("outward", 5))
ax.spines["bottom"].set_position(("outward", 5))

# Save the plot
plt.savefig("pareto_frontier.pdf", bbox_inches="tight")
plt.savefig("pareto_frontier.png", bbox_inches="tight", dpi=300)
print("✅ Pareto frontier plots saved to pareto_frontier.pdf and pareto_frontier.png")
