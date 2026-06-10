import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import seaborn as sns
import os
import numpy as np
import re

# ==========================================
# CONFIGURATION
# ==========================================
CSV_EVAL = 'evaluation_results.csv.zip'
CSV_PARAMS = 'parameter_search_results.csv'
OUTPUT_DIR = 'plots'

# Representative Logs
REP_LOGS = ['age_of_empires_ocel2.json', 'order-management.json']

# Standard Colors & Names
NAME_OFFLINE = 'Offline'
NAME_BASE = 'Online Base'
NAME_HEUR = 'Online Heuristics'

COLOR_OFFLINE = '#ef4444' # Red
COLOR_BASE = '#22c55e'    # Green
COLOR_HEUR = '#a855f7'    # Purple

# Setup plotting style for paper
plt.rcParams.update({
    'font.size': 12,
    'axes.titlesize': 14,
    'axes.labelsize': 12,
    'legend.fontsize': 10,
    'figure.autolayout': True,
    'axes.grid': True,
    'grid.alpha': 0.3
})

def format_log_name(name):
    """Cleans log names for titles."""
    name = name.replace('.json', '')
    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    name = re.sub(r'[-_]', ' ', name)
    words = name.split()
    small_words = {'of', 'and', 'on', 'in', 'the', 'for', 'with', 'to'}
    name = ' '.join([w.capitalize() if i == 0 or w.lower() not in small_words else w.lower() for i, w in enumerate(words)])
    name = name.replace('Lrms Collection', 'LRMS Collection')
    name = name.replace('Age of Empires Ocel2', 'Age of Empires')
    return name

def prepare_eval_data(csv_path):
    actual_path = csv_path
    
    # Prioritize unzipped version if it exists
    if csv_path.endswith('.zip'):
        unzipped_path = csv_path[:-4]
        if os.path.exists(unzipped_path):
            actual_path = unzipped_path
            print(f"Prioritizing unzipped file: {actual_path}")
            
    # Fallback to zipped version if unzipped does not exist
    if not os.path.exists(actual_path):
        if not csv_path.endswith('.zip'):
            zipped_path = csv_path + '.zip'
            if os.path.exists(zipped_path):
                actual_path = zipped_path
                print(f"Unzipped file not found. Falling back to zipped file: {actual_path}")

    if not os.path.exists(actual_path):
        print(f"Warning: Neither {csv_path} nor its zipped/unzipped counterpart was found.")
        return None
        
    print(f"Loading evaluation data from: {actual_path}")
    df = pd.read_csv(actual_path)
    df['offline_ms'] = df['offline_ns'] / 1_000_000
    df['online_base_ms'] = df['online_base_ns'] / 1_000_000
    df['online_heur_ms'] = df['online_heur_ns'] / 1_000_000
    df['total_mem_base_mb'] = df['total_mem_base_bytes'] / (1024 * 1024)
    df['total_mem_heur_mb'] = df['total_mem_heur_bytes'] / (1024 * 1024)
    return df

# --- Plotting Helpers ---

def plot_scalability(df_log, log_name, ax):
    """Scalability logic."""
    offline_df = df_log.dropna(subset=['offline_ms'])
    base_df = df_log.dropna(subset=['online_base_ms'])
    ax.plot(offline_df['event_index'], offline_df['offline_ms'], label=NAME_OFFLINE, color=COLOR_OFFLINE, linewidth=2)
    ax.scatter(base_df['event_index'], base_df['online_base_ms'], label=NAME_BASE, color=COLOR_BASE, alpha=0.5, s=15)
    ax.set_yscale('log')
    ax.set_xlabel('Event Index')
    ax.set_ylabel('Processing Time (ms)')
    ax.xaxis.set_major_formatter(ticker.ScalarFormatter())
    ax.xaxis.get_major_formatter().set_scientific(False)
    ax.set_title(f'Computational Scalability ({format_log_name(log_name)})')
    ax.legend()

def plot_memory_dynamics(df_log, log_name, ax):
    """Memory dynamics logic."""
    mem_base = df_log.dropna(subset=['total_mem_base_mb'])
    mem_heur = df_log.dropna(subset=['total_mem_heur_mb'])
    ax.plot(mem_base['event_index'], mem_base['total_mem_base_mb'], label=NAME_BASE, color=COLOR_BASE, linewidth=2)
    ax.plot(mem_heur['event_index'], mem_heur['total_mem_heur_mb'], label=NAME_HEUR, color=COLOR_HEUR, linewidth=2)
    ax.set_xlabel('Event Index')
    ax.set_ylabel('Memory (MB)')
    # Ensure no scientific notation on X axis
    ax.xaxis.set_major_formatter(ticker.ScalarFormatter())
    ax.xaxis.get_major_formatter().set_scientific(False)
    ax.set_title(f'Memory Dynamics ({format_log_name(log_name)})')
    ax.legend()

def plot_recovery_curve(df_log, log_name, ax):
    """Recovery curve logic."""
    diff_heur = df_log.dropna(subset=['heur_extra_arcs', 'heur_missing_arcs'])
    ax.plot(diff_heur['event_index'], diff_heur['heur_extra_arcs'], label='FDR (FP / (FP + TP))', color='#f59e0b', linewidth=2, linestyle='--')
    ax.plot(diff_heur['event_index'], diff_heur['heur_missing_arcs'], label='FNR (FN / (FN + TP))', color='#dc2626', linewidth=2, linestyle='--')
    ax.set_xlabel('Event Index')
    ax.set_ylabel('Structural Deviation (0-1)')
    ax.set_ylim(-0.05, 1.05)
    ax.xaxis.set_major_formatter(ticker.ScalarFormatter())
    ax.xaxis.get_major_formatter().set_scientific(False)
    ax.set_title(f'Structural Recovery ({format_log_name(log_name)})')
    ax.legend()

# --- Experiments ---

def run_experiment_1(df, base_dir):
    print("Running Experiment 1: Processing Time...")
    exp_dir = os.path.join(base_dir, "exp1_time")
    os.makedirs(exp_dir, exist_ok=True)
    available_logs = sorted(df['log'].unique())

    # Plot A: Stability (Restored Scatter)
    melted_times = []
    formatted_log_order = []
    for log in available_logs:
        log_df = df[df['log'] == log]
        formatted_log = format_log_name(log)
        formatted_log_order.append(formatted_log)
        for t in log_df['offline_ms'].dropna(): melted_times.append({'Log': formatted_log, 'Algorithm': NAME_OFFLINE, 'Time (ms)': t})
        for t in log_df['online_base_ms'].dropna(): melted_times.append({'Log': formatted_log, 'Algorithm': NAME_BASE, 'Time (ms)': t})
        for t in log_df['online_heur_ms'].dropna(): melted_times.append({'Log': formatted_log, 'Algorithm': NAME_HEUR, 'Time (ms)': t})
    
    df_melted = pd.DataFrame(melted_times)
    palette = {NAME_OFFLINE: COLOR_OFFLINE, NAME_BASE: COLOR_BASE, NAME_HEUR: COLOR_HEUR}
    
    figA, axA = plt.subplots(figsize=(12, 6))
    # Ensure dots are behind boxes by setting explicit zorder
    sns.stripplot(data=df_melted, x='Log', y='Time (ms)', hue='Algorithm', dodge=True, alpha=0.2, jitter=True, 
                  ax=axA, palette=palette, size=2, legend=False, order=formatted_log_order, zorder=1)
    sns.boxplot(data=df_melted, x='Log', y='Time (ms)', hue='Algorithm', showfliers=False, ax=axA, 
                palette=palette, width=0.6, boxprops=dict(alpha=0.7), order=formatted_log_order, zorder=10)
    
    axA.set_yscale('log')
    axA.set_xticks(range(len(formatted_log_order)))
    axA.set_xticklabels(formatted_log_order, rotation=45, ha='right')
    axA.set_title('Per-Event Processing Time Stability')
    figA.savefig(os.path.join(exp_dir, "Plot_A_Stability.png"), bbox_inches='tight', dpi=300)
    plt.close(figA)

    # Plot B: Scalability (Side-by-side)
    reps = [l for l in REP_LOGS if l in available_logs]
    figB, axesB = plt.subplots(1, len(reps), figsize=(7 * len(reps), 5))
    if len(reps) == 1: axesB = [axesB]
    for idx, log in enumerate(reps):
        plot_scalability(df[df['log'] == log], log, axesB[idx])
    figB.savefig(os.path.join(exp_dir, "Plot_B_Scalability.png"), bbox_inches='tight', dpi=300)
    plt.close(figB)

    # Individual Plot B
    sub_dir = os.path.join(exp_dir, "Plot_B_Scalability_Individual")
    os.makedirs(sub_dir, exist_ok=True)
    for log in available_logs:
        fig, ax = plt.subplots(figsize=(8, 5))
        plot_scalability(df[df['log'] == log], log, ax)
        fig.savefig(os.path.join(sub_dir, f"Plot_B_{log.replace('.json', '')}.png"))
        plt.close(fig)

def run_experiment_2(df, base_dir):
    print("Running Experiment 2: Memory & Validity...")
    exp_dir = os.path.join(base_dir, "exp2_memory_validity")
    os.makedirs(exp_dir, exist_ok=True)
    available_logs = sorted(df['log'].unique())
    reps = [l for l in REP_LOGS if l in available_logs]

    # Plot C: Global Tradeoff
    all_processed_logs = []
    bin_edges = np.linspace(0, 100, 101)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    all_data_normalized = []
    for log in available_logs:
        log_df = df[df['log'] == log].copy()
        cols = ['total_mem_base_mb', 'total_mem_heur_mb', 'heur_extra_arcs', 'heur_missing_arcs']
        log_df = log_df.dropna(subset=cols)
        if len(log_df) < 2: continue
        log_df['replay_pct'] = (log_df['event_index'] - log_df['event_index'].min()) / (log_df['event_index'].max() - log_df['event_index'].min()) * 100
        log_df['point_savings_pct'] = (log_df['total_mem_base_mb'] - log_df['total_mem_heur_mb']) / log_df['total_mem_base_mb'] * 100
        log_df['bin_idx'] = pd.cut(log_df['replay_pct'], bins=bin_edges, labels=False, include_lowest=True)
        log_binned = log_df.groupby('bin_idx').agg({'heur_extra_arcs': 'mean', 'heur_missing_arcs': 'mean'}).reindex(range(100)).interpolate()
        log_processed = log_binned.reset_index(); log_processed['replay_pct_bin'] = log_processed['bin_idx'].map(lambda x: bin_centers[x])
        all_processed_logs.append(log_processed); all_data_normalized.append(log_df[['replay_pct', 'point_savings_pct']])
    
    if all_processed_logs:
        df_raw_all = pd.concat(all_data_normalized)
        df_raw_all['bin_idx'] = pd.cut(df_raw_all['replay_pct'], bins=bin_edges, labels=False, include_lowest=True)
        mem_binned = df_raw_all.groupby('bin_idx')['point_savings_pct'].mean().reset_index()
        drift_binned = pd.concat(all_processed_logs).groupby('replay_pct_bin').mean(numeric_only=True).reset_index()
        binned = pd.merge(drift_binned, mem_binned, left_index=True, right_on='bin_idx')

        figC, axC1 = plt.subplots(figsize=(10, 6))
        ln1 = axC1.plot(binned['replay_pct_bin'], binned['point_savings_pct'], color=COLOR_HEUR, linewidth=3, label='Memory Savings (%)')
        axC1.set_xlabel('Share of Log Replayed (%)'); axC1.set_ylabel('Avg. Savings (%)'); axC1.set_ylim(-5, 105)
        axC2 = axC1.twinx()
        ln2 = axC2.plot(binned['replay_pct_bin'], binned['heur_extra_arcs'], color='#f59e0b', linestyle='--', label='Avg. FDR (FP / (FP + TP)')
        ln3 = axC2.plot(binned['replay_pct_bin'], binned['heur_missing_arcs'], color='#dc2626', linestyle='--', label='Avg. FNR (FN / (FN + TP))')
        axC2.set_ylabel('Avg. Deviation'); axC2.set_ylim(-0.05, 1.05)
        
        # Combine legends and put in upper left
        lns = ln1 + ln2 + ln3
        labs = [l.get_label() for l in lns]
        axC1.legend(lns, labs, loc='upper left')

        axC1.set_title('Average Memory Savings - Accuracy Trade-off')
        figC.savefig(os.path.join(exp_dir, "Plot_C_Global_Tradeoff.png"), bbox_inches='tight', dpi=300)
        plt.close(figC)

    # Plot D: Memory Dynamics (Side-by-side)
    figD, axesD = plt.subplots(1, len(reps), figsize=(7 * len(reps), 5))
    if len(reps) == 1: axesD = [axesD]
    for idx, log in enumerate(reps):
        plot_memory_dynamics(df[df['log'] == log], log, axesD[idx])
    figD.savefig(os.path.join(exp_dir, "Plot_D_Memory_Dynamics.png"), bbox_inches='tight', dpi=300)
    plt.close(figD)

    # Individual Plot D
    sub_dir_d = os.path.join(exp_dir, "Plot_D_Memory_Dynamics_Individual")
    os.makedirs(sub_dir_d, exist_ok=True)
    for log in available_logs:
        fig, ax = plt.subplots(figsize=(8, 5))
        plot_memory_dynamics(df[df['log'] == log], log, ax)
        fig.savefig(os.path.join(sub_dir_d, f"Plot_D_{log.replace('.json', '')}.png"))
        plt.close(fig)

    # Plot E: Recovery Curve (Side-by-side)
    figE, axesE = plt.subplots(1, len(reps), figsize=(7 * len(reps), 5))
    if len(reps) == 1: axesE = [axesE]
    for idx, log in enumerate(reps):
        plot_recovery_curve(df[df['log'] == log], log, axesE[idx])
    figE.savefig(os.path.join(exp_dir, "Plot_E_Recovery_Curve.png"), bbox_inches='tight', dpi=300)
    plt.close(figE)

    # Individual Plot E
    sub_dir_e = os.path.join(exp_dir, "Plot_E_Recovery_Curve_Individual")
    os.makedirs(sub_dir_e, exist_ok=True)
    for log in available_logs:
        fig, ax = plt.subplots(figsize=(8, 5))
        plot_recovery_curve(df[df['log'] == log], log, ax)
        fig.savefig(os.path.join(sub_dir_e, f"Plot_E_{log.replace('.json', '')}.png"))
        plt.close(fig)

    # Table
    drift_table_data = []
    for log in available_logs:
        log_df = df[df['log'] == log]
        max_base = log_df['total_mem_base_mb'].max()
        max_heur = log_df['total_mem_heur_mb'].max()
        drift_table_data.append({
            'Log': format_log_name(log), 
            'Avg FP': f"{log_df['heur_extra_arcs'].mean():.4f}", 
            'Avg FN': f"{log_df['heur_missing_arcs'].mean():.4f}",
            'Mem Base (MB)': f"{max_base:.2f}", 
            'Mem Heur (MB)': f"{max_heur:.2f}", 
            'Savings (%)': f"{((max_base - max_heur) / max_base * 100):.1f}\\%" if max_base > 0 else "0\\%"
        })
    
    with open(os.path.join(exp_dir, 'Table_Performance_Metrics.tex'), 'w') as f:
        f.write("\\begin{table}[ht]\n\\centering\n\\begin{tabular}{l|cc|ccc}\n\\toprule\n")
        f.write("Log & Avg FP & Avg FN & Mem Base & Mem Heur & Savings \\\\\n")
        f.write(" & & & (MB) & (MB) & (\\%) \\\\\n\\midrule\n")
        for row in drift_table_data:
            f.write(f"{row['Log']} & {row['Avg FP']} & {row['Avg FN']} & {row['Mem Base (MB)']} & {row['Mem Heur (MB)']} & {row['Savings (%)']} \\\\\n")
        f.write("\\bottomrule\n\\end{tabular}\n\\end{table}\n")

def run_experiment_3(base_dir):
    print("Running Experiment 3: Parameter Search (Pareto)...")
    exp_dir = os.path.join(base_dir, "exp3_parameters")
    os.makedirs(exp_dir, exist_ok=True)
    if not os.path.exists(CSV_PARAMS): return

    df = pd.read_csv(CSV_PARAMS)
    all_logs_data = []
    for log_name, group in df.groupby("log"):
        baseline_mem = group.loc[group["max_inactive"].idxmax(), "total_mem_bytes"]
        group = group.copy(); group["memory_savings"] = (1 - group["total_mem_bytes"] / baseline_mem) * 100
        all_logs_data.append(group)
    df_combined = pd.concat(all_logs_data)

    fig, ax = plt.subplots(figsize=(12, 5), dpi=300)
    colors = ["#a855f7", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#6366f1"]
    markers = ["o", "s", "D", "^", "v", "P", "*"]
    
    sweet_spots = []
    for i, (log_name, group) in enumerate(df_combined.groupby("log")):
        sorted_group = group.sort_values(by=["f1_score", "memory_savings"], ascending=[False, False])
        pareto_points = []; max_savings_seen = -np.inf
        for _, row in sorted_group.iterrows():
            if row["memory_savings"] > max_savings_seen:
                pareto_points.append(row); max_savings_seen = row["memory_savings"]
        pareto_df = pd.DataFrame(pareto_points).sort_values("memory_savings")
        color = colors[i % len(colors)]
        
        ax.scatter(group["memory_savings"], group["f1_score"], color=color, alpha=0.15, s=20, edgecolors='none')
        ax.plot(pareto_df["memory_savings"], pareto_df["f1_score"], marker=markers[i % len(markers)], markersize=6, linewidth=2.5, color=color, label=format_log_name(log_name))
        
        # Sweet spot
        ss = group.loc[group[group["f1_score"] >= group["f1_score"].max() - 1e-6]["memory_savings"].idxmax()].copy()
        ss['display_name'] = format_log_name(log_name)
        sweet_spots.append(ss)
        ax.plot(ss['memory_savings'], ss['f1_score'], marker="*", markersize=15, color="#f59e0b", markeredgecolor="#92400e", zorder=5)

    # Manual Equal Spacing at y=1.2
    sweet_spots.sort(key=lambda x: x['memory_savings'])
    n_spots = len(sweet_spots)
    # Define x-positions evenly from 5% to 95%
    label_x_positions = np.linspace(5, 95, n_spots)
    
    for i, ss in enumerate(sweet_spots):
        inactivity_range = f"[{int(ss['min_inactive'])}, {int(ss['max_inactive'])}]"
        ax.annotate(f"{ss['display_name']}\nSaved: {ss['memory_savings']:.1f}%\nRange: {inactivity_range}", 
                    xy=(ss['memory_savings'], ss['f1_score']), 
                    xytext=(label_x_positions[i], 1.2),
                    ha='center', va='center',
                    fontsize=9, fontweight="bold",
                    bbox=dict(boxstyle="round,pad=0.3", fc="#fffbeb", ec="#fde68a", alpha=0.9),
                    arrowprops=dict(arrowstyle="->", color="#92400e", lw=0.8, alpha=0.4, 
                                    connectionstyle="arc3,rad=-0.1" if label_x_positions[i] > ss['memory_savings'] else "arc3,rad=0.1"))

    ax.set_xlabel("Memory Savings (%)"); ax.set_ylabel("Discovery Accuracy (F1 Score)")
    ax.set_title("Memory-Accuracy Pareto Frontier", pad=20)
    ax.set_xlim(-5, 105); ax.set_ylim(-0.05, 1.35)
    ax.set_yticks([0, 0.2, 0.4, 0.6, 0.8, 1.0])
    ax.legend(loc="lower left", ncol=2)
    fig.savefig(os.path.join(exp_dir, "Plot_F_Pareto_Frontier.png"), bbox_inches='tight', dpi=300)
    plt.close(fig)

def main():
    df = prepare_eval_data(CSV_EVAL)
    if df is not None:
        run_experiment_1(df, OUTPUT_DIR)
        run_experiment_2(df, OUTPUT_DIR)
    run_experiment_3(OUTPUT_DIR)
    print(f"\nSuccess! All plots generated in '{OUTPUT_DIR}' directory.")

if __name__ == "__main__":
    main()
