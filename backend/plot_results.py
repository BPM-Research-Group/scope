import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import numpy as np
import os
import re

# ==========================================
# CONFIGURATION
# ==========================================
CSV_PATH = 'parameter_search_results.csv'
OUTPUT_DIR = 'paper_plots'

COLOR_PARETO = '#a855f7' # Purple (matching Online Heuristics color)
COLOR_SEARCH = '#cbd5e1' # Slate gray for search space background

# Setup plotting style for academic papers to match your other plots
plt.rcParams.update({
    'font.size': 12,
    'axes.titlesize': 14,
    'axes.labelsize': 12,
    'legend.fontsize': 10,
    'figure.autolayout': True,
    'axes.grid': True,
    'grid.alpha': 0.3
})

def format_title(name):
    """Cleans log names for titles: removes .json, splits camelCase, replaces -/_ with space, title case, and manual fixes."""
    name = name.replace('.json', '')
    # Split camelCase
    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    # Replace - and _
    name = re.sub(r'[-_]', ' ', name)
    words = name.split()
    small_words = {'of', 'and', 'on', 'in', 'the', 'for', 'with', 'to'}
    name = ' '.join([w.capitalize() if i == 0 or w.lower() not in small_words else w.lower() for i, w in enumerate(words)])
    
    # Manual cleanup
    name = name.replace('Lrms Collection', 'LRMS Collection')
    name = name.replace('Lrmscollection', 'LRMS Collection') # Backup for older naming
    name = name.replace('Age of Empires Ocel2', 'Age of Empires')
    return name

def generate_pareto_plot():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"Error: {CSV_PATH} not found. Please run the evaluation test first.")
        
    df = pd.read_csv(CSV_PATH)
    
    # Create the figure
    fig, ax = plt.subplots(figsize=(8, 5.2))
    
    available_logs = sorted(df['log'].unique())
    
    # Group by log to plot each Pareto frontier
    for idx, log_name in enumerate(available_logs):
        group = df[df['log'] == log_name].copy()
        
        # 1. Identify baseline memory (where max_inactive == total_events)
        baseline_row = group[group["max_inactive"] == group["total_events"]]
        if baseline_row.empty:
            baseline_row = group.loc[group["max_inactive"].idxmax()]
        
        baseline_mem = baseline_row["total_mem_bytes"].values[0]
        
        # 2. Calculate Memory Savings (%)
        group["memory_savings"] = (1 - group["total_mem_bytes"] / baseline_mem) * 100
        
        # 3. Extract the real Pareto frontier
        # We sort by savings descending and iteratively keep points with strictly higher F1 scores
        desc_group = group.sort_values(by="memory_savings", ascending=False)
        current_max_f1 = -1.0
        pareto_points = []
        
        for _, row in desc_group.iterrows():
            if row["f1_score"] >= current_max_f1:
                current_max_f1 = row["f1_score"]
                pareto_points.append(row)
                
        # Sort ascending for plotting
        pareto_df = pd.DataFrame(pareto_points).sort_values("memory_savings")
        
        # Plot all scanned parameter combinations as a light background scatter plot
        ax.scatter(
            group["memory_savings"],
            group["f1_score"],
            color=COLOR_SEARCH,
            alpha=0.4,
            s=25,
            edgecolors='none',
            zorder=2,
            label='Scanned Parameter Space' if idx == 0 else None
        )
        
        # Plot Pareto frontier line
        formatted_log_name = format_title(log_name)
        ax.plot(
            pareto_df["memory_savings"],
            pareto_df["f1_score"],
            marker="o",
            markersize=6,
            linewidth=2.5,
            color=COLOR_PARETO,
            zorder=3,
            label=f'{formatted_log_name} (Pareto Frontier)'
        )
        
        # 4. Find the real sweet spot (maximum F1 score with maximized memory savings)
        sweet_spot_candidates = pareto_df[pareto_df["f1_score"] >= 0.9999]
        if not sweet_spot_candidates.empty:
            # Since sorted by memory savings ascending, the last candidate has the highest memory savings
            sweet_spot = sweet_spot_candidates.iloc[-1]
            
            # Plot sweet spot star
            ax.plot(
                sweet_spot["memory_savings"],
                sweet_spot["f1_score"],
                marker="*",
                markersize=14,
                color="#f59e0b", # Warm amber star
                markeredgecolor="#78350f",
                markeredgewidth=1.2,
                zorder=5,
                label='Optimal Sweet Spot (F1 = 1.0)' if idx == 0 else None
            )
            
            # Annotate with the exact inactivity bounds used
            min_inact = int(sweet_spot['min_inactive'])
            max_inact = int(sweet_spot['max_inactive'])
            
            ax.annotate(
                f"Memory Saved: {sweet_spot['memory_savings']:.1f}%\nInactivity: [{min_inact:,}, {max_inact:,}]",
                xy=(sweet_spot['memory_savings'], sweet_spot['f1_score']),
                xytext=(sweet_spot['memory_savings'] - 38, sweet_spot['f1_score'] - 0.28),
                arrowprops=dict(
                    arrowstyle="-|>", 
                    color="#78350f", 
                    lw=1.2, 
                    patchA=None, 
                    patchB=None, 
                    connectionstyle="arc3,rad=-0.1"
                ),
                fontsize=9.5,
                fontweight="semibold",
                color="#78350f",
                bbox=dict(boxstyle="round,pad=0.4", fc="#fef9c3", ec="#fef08a", alpha=0.95, lw=1),
                zorder=6
            )
            
    # Decoration matching standard paper plot layout
    ax.set_xlabel('Memory Savings (%)')
    ax.set_ylabel('Discovery Accuracy (F1 Score)')
    ax.set_title(f'Efficiency-Accuracy Pareto Frontier ({format_title(available_logs[0])})')
    
    # Configure axes limits and formatting
    ax.set_xlim(-5, 105)
    ax.set_ylim(-0.05, 1.1)
    ax.xaxis.set_major_formatter(ticker.PercentFormatter(xmax=100, decimals=0))
    ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.1f'))
    
    # Grid configuration matching template
    ax.grid(True, which='both', linestyle='--', alpha=0.3)
    ax.legend(loc='lower left', frameon=True, facecolor='white', framealpha=0.9)
    
    # Save high-res plot
    output_path = os.path.join(OUTPUT_DIR, 'Plot_F_Pareto_Frontier.png')
    fig.savefig(output_path, bbox_inches='tight', dpi=300)
    plt.close(fig)
    
    print(f"Success! Publication-grade Pareto plot saved as '{output_path}'")

if __name__ == "__main__":
    generate_pareto_plot()
