

import React, { useMemo, useState } from "react";

import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { Pie } from "@visx/shape";

import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale";

import { AxisBottom, AxisLeft } from "@visx/axis";



type Stats = {
  mean: number;
  max: number;
  min: number;
  sum: number;
};

type ObjectAttributeStat = {
  attribute_name: string;
  entity_type: string;
  stats: Stats;
};

type DashboardData = {
  total_events: number;
  total_objects: number;
  object_attribute_stats: ObjectAttributeStat[];
};

type BarChartData = {
  label: string;
  value: number;
};

type PieChartData = {
  label: string;
  value: number;
};



const dashboardData: DashboardData = {
  total_events: 21008,
  total_objects: 10840,

  object_attribute_stats: [
    {
      attribute_name: "price",
      entity_type: "orders",
      stats: {
        mean: 2380.95,
        max: 11241.55,
        min: 36.7,
        sum: 4761909.99,
      },
    },

    {
      attribute_name: "price",
      entity_type: "products",
      stats: {
        mean: 623.09,
        max: 2946.5,
        min: 29.99,
        sum: 74770.9,
      },
    },

    {
      attribute_name: "weight",
      entity_type: "packages",
      stats: {
        mean: 4.13,
        max: 13.87,
        min: 0.166,
        sum: 4668.38,
      },
    },
  ],
};

const COLORS = [
  "#2563eb",
  "#9333ea",
  "#14b8a6",
  "#f97316",
];


const AnalyticsDashboard: React.FC = () => {
  const [entity, setEntity] = useState<string>("orders");

  const [attribute, setAttribute] =
    useState<string>("price");

  const [operation, setOperation] =
    useState<keyof Stats>("sum");

  

  const entityOptions = useMemo(() => {
    return [
      ...new Set(
        dashboardData.object_attribute_stats.map(
          (item) => item.entity_type
        )
      ),
    ];
  }, []);

  

  const attributeOptions = useMemo(() => {
    return [
      ...new Set(
        dashboardData.object_attribute_stats
          .filter((item) => item.entity_type === entity)
          .map((item) => item.attribute_name)
      ),
    ];
  }, [entity]);

  

  const selectedKpi = useMemo(() => {
    return dashboardData.object_attribute_stats.find(
      (item) =>
        item.entity_type === entity &&
        item.attribute_name === attribute
    );
  }, [entity, attribute]);

  const generatedValue =
    selectedKpi?.stats?.[operation];

  

  const barChartData: BarChartData[] =
    dashboardData.object_attribute_stats.map(
      (item) => ({
        label: item.entity_type,
        value: item.stats.mean,
      })
    );

  

  const pieChartData: PieChartData[] =
    dashboardData.object_attribute_stats.map(
      (item) => ({
        label: item.entity_type,
        value: item.stats.sum,
      })
    );

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        

        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            KPI Dashboard
          </h1>

         
        </div>

        

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

          <KpiCard
            title="Total Events"
            value={dashboardData.total_events}
          />

          <KpiCard
            title="Total Objects"
            value={dashboardData.total_objects}
          />

          <KpiCard
            title="Average Order Price"
            value="€2380.95"
          />

          <KpiCard
            title="Max Product Price"
            value="€2946.5"
          />
        </div>

        

        <div className="bg-white rounded-2xl shadow p-6">

          <h2 className="text-xl font-semibold mb-5">
            KPI Builder
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

           

            <div>
              <label className="block text-sm font-medium mb-2">
                Object Type
              </label>

              <select
                value={entity}
                onChange={(e) => {
                  setEntity(e.target.value);
                  setAttribute("price");
                }}
                className="w-full border rounded-xl px-3 py-2"
              >
                {entityOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            

            <div>
              <label className="block text-sm font-medium mb-2">
                Attribute
              </label>

              <select
                value={attribute}
                onChange={(e) =>
                  setAttribute(e.target.value)
                }
                className="w-full border rounded-xl px-3 py-2"
              >
                {attributeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            

            <div>
              <label className="block text-sm font-medium mb-2">
                Aggregation
              </label>

              <select
                value={operation}
                onChange={(e) =>
                  setOperation(
                    e.target.value as keyof Stats
                  )
                }
                className="w-full border rounded-xl px-3 py-2"
              >
                <option value="sum">Sum</option>
                <option value="mean">Mean</option>
                <option value="max">Max</option>
                <option value="min">Min</option>
              </select>
            </div>

            

            <div>
              <label className="block text-sm font-medium mb-2">
                KPI Value
              </label>

              <div className="border rounded-xl px-4 py-2 bg-slate-50 font-semibold">
                {generatedValue}
              </div>
            </div>
          </div>
        </div>

       

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          

          <div className="bg-white rounded-2xl shadow p-6">

            <h2 className="text-lg font-semibold mb-4">
              Average KPI Values
            </h2>

            <BarChart
              data={barChartData}
              width={500}
              height={300}
            />
          </div>

          

          <div className="bg-white rounded-2xl shadow p-6">

            <h2 className="text-lg font-semibold mb-4">
              KPI Sum Distribution
            </h2>

            <PieChart
              data={pieChartData}
              width={500}
              height={300}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;



type KpiCardProps = {
  title: string;
  value: string | number;
};

const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
}) => {
  return (
    <div className="bg-white rounded-2xl shadow p-5">

      <p className="text-sm text-slate-500">
        {title}
      </p>

      <h2 className="text-2xl font-bold mt-2 text-slate-800">
        {value}
      </h2>
    </div>
  );
};



type BarChartProps = {
  data: BarChartData[];
  width: number;
  height: number;
};

const BarChart: React.FC<BarChartProps> = ({
  data,
  width,
  height,
}) => {
  const margin = {
    top: 20,
    right: 20,
    bottom: 50,
    left: 60,
  };

  const xMax =
    width - margin.left - margin.right;

  const yMax =
    height - margin.top - margin.bottom;

  const xScale = scaleBand<string>({
    domain: data.map((d) => d.label),
    range: [0, xMax],
    padding: 0.3,
  });

  const yScale = scaleLinear<number>({
    domain: [
      0,
      Math.max(...data.map((d) => d.value)),
    ],
    range: [yMax, 0],
    nice: true,
  });

  return (
    <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>

        {data.map((d, index) => {
          const barHeight =
            yMax - yScale(d.value);

          return (
            <Bar
              key={d.label}
              x={xScale(d.label)}
              y={yScale(d.value)}
              width={xScale.bandwidth()}
              height={barHeight}
              fill={
                COLORS[index % COLORS.length]
              }
              rx={8}
            />
          );
        })}

        <AxisLeft scale={yScale} />

        <AxisBottom
          top={yMax}
          scale={xScale}
        />
      </Group>
    </svg>
  );
};



type PieChartProps = {
  data: PieChartData[];
  width: number;
  height: number;
};

const PieChart: React.FC<PieChartProps> = ({
  data,
  width,
  height,
}) => {
  const radius =
    Math.min(width, height) / 2;

  const colorScale = scaleOrdinal({
    domain: data.map((d) => d.label),
    range: COLORS,
  });

  return (
    <svg width={width} height={height}>
      <Group
        top={height / 2}
        left={width / 2}
      >
        <Pie
          data={data}
          pieValue={(d) => d.value}
          outerRadius={radius - 50}
        >
          {(pie) =>
            pie.arcs.map((arc, index) => (
              <g key={index}>
                <path
                  d={pie.path(arc) || ""}
                  fill={colorScale(
                    arc.data.label
                  )}
                />

                <text
                  x={
                    pie.path.centroid(arc)[0]
                  }
                  y={
                    pie.path.centroid(arc)[1]
                  }
                  dy=".33em"
                  fontSize={12}
                  textAnchor="middle"
                  fill="white"
                >
                  {arc.data.label}
                </text>
              </g>
            ))
          }
        </Pie>
      </Group>
    </svg>
  );
};