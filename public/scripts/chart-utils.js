// Epicor blue
const epicorBlue = "rgb(49,144,214)";
// Epicor light gray
const epicorLightGray = "rgb(239,243,239)";

// Define a set of colors to use for the pie chart.
const COLORS = [
  "rgba(77, 201, 246, 1)",
  "rgba(246, 112, 25, 1)",
  "rgba(176, 190, 197, 1)",
  "rgba(245, 55, 148, 1)",
  "rgba(83, 123, 196, 1)",
  "rgba(172, 194, 54, 1)",
  "rgba(22, 106, 143, 1)",
  "rgba(249, 212, 35, 1)",
  "rgba(88, 89, 91, 1)",
  "rgba(252, 145, 58, 1)",
  "rgba(226, 226, 226, 1)",
  "rgba(4, 6, 5, 1)",
  "rgba(133, 73, 186, 1)",
  "rgba(144, 164, 174, 1)",
];

/* ----------------------------
    Description: Creates doughnut charts with an inside label resembling the QlikView gauge
---------------------------- */
function createQVDonut(data) {
  let pctCompl = 0;
  let innerLabel = "";
  // Avoid division by zero
  if (data.datasets[0].data[0] + data.datasets[0].data[1] != 0) {
    // Add the two values to arrive a full dataset and then divide and round to derive a percentage.
    pctCompl = Math.round(
      (data.datasets[0].data[0] /
        (data.datasets[0].data[0] + data.datasets[0].data[1])) *
        100
    );
    innerLabel = pctCompl.toString() + "%";
    if (pctCompl === 0) {
      // If the percentage is 0, swap the values to create a full red chart
      data.datasets[0].data[0] = data.datasets[0].data[1];
      data.datasets[0].data[1] = 0;
    } // Force a value to make the chart render; all 0s will make an empty chart
  } else {
    // Force a value to make the chart render; all 0s will make an empty chart
    innerLabel = "-";
    data.datasets[0].data[1] = 1;
  }
  // Set the background color based on the percentage completed
  data.datasets[0].backgroundColor[0] = getBgColor(pctCompl);

  // Draw the inner circle with text
  const circleLabel = {
    id: "circleLabel",
    label: innerLabel,
    // Mimic the Qlikview gauge by drawing a circle and adding the label inside
    beforeDatasetsDraw(chart, args, plugins) {
      const { ctx, data, options } = chart;
      // Grab the x, y location data for the inner most (only) dataset as the inner circle boundary
      const x = chart.getDatasetMeta(0).data[0].x;
      const y = chart.getDatasetMeta(0).data[0].y;
      const angle = Math.PI / 180;
      const datasetLength = data.datasets.length - 1;
      const radius =
        chart.getDatasetMeta(datasetLength).data[0].innerRadius -
        options.borderWidth;
      // Save the canvas to restore later
      ctx.save();
      // Move to the x, y and draw a circle
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.fillStyle = "white";
      ctx.arc(0, 0, radius, 0, angle * 360, false);
      ctx.fill();
      // Add the label and center
      ctx.font = "bold 60px sans-serif";
      ctx.fillStyle = "black";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // text, x, y
      ctx.fillText(this.label, 0, -10);
      // Add a second label of different size underneath. Note the fillText() method ignores \n
      ctx.font = "25px sans-serif";
      ctx.fillText(data.label2, 0, 25);
      ctx.restore();
    },
  };

  const config = {
    type: "doughnut",
    data,
    options: {
      // Set to false to use the canvas element's size
      responsive: true,
      rotation: 180,
      hoverOffset: 20,
      // Size of the donut hole
      cutout: "70%",
      borderWidth: 0,
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: data.title,
          color: "black",
          position: "bottom",
          align: "center",
          font: { weight: "bold" },
        },
      },
    },
    plugins: [circleLabel],
  };

  const ctx = document.getElementById(data.id).getContext("2d");
  const myChart = new Chart(ctx, config);
}

// Function to get a color for each slice of the pie chart
function getSliceColor(index, alpha = 1) {
  const color = COLORS[index % COLORS.length];
  return color.replace(/[^,]+(?=\))/, alpha);
}

// Function to return a color based on the percentage completed
function getBgColor(pctCompl) {
  if (pctCompl < 50) {
    return "red";
  } else if (pctCompl < 75) {
    return "orange";
  } else {
    return epicorBlue; // Use the Epicor blue color for 75% and above
  }
}

// Generic function to create a chart configuration object
function getChartConfig(id, title, label2, data) {
  return {
    id: id,
    title: title,
    label2: label2,
    datasets: [
      {
        data: data,
        backgroundColor: [epicorBlue, epicorLightGray],
        borderWidth: 0,
      },
    ],
  };
}
/*
 * Function to create a pie chart configuration object
 * @param {Object} dataObject - An object with keys as labels and values as data points
 * @param {string} id - The ID of the canvas element where the chart will be rendered
 * @param {string} sliceLabel - The label for the pie slices
 * @param {string} chartTitle - The title of the chart
 * @returns {Object} - A configuration object for a pie chart
 * This function sorts the data object by value, limits the number of slices to a maximum defined by COLORS,
 * and groups any excess data into an "Other" slice.
 * It returns a configuration object that can be used with Chart.js to render a pie chart.
 */
function getPieChartConfig(
  dataObject,
  id,
  sliceLabel,
  chartTitle,
  maxColors = COLORS.length - 1
) {
  // Sort the object by value for a more appealing display
  const sortedObj = Object.fromEntries(
    Object.entries(dataObject).sort(([, a], [, b]) => b - a)
  );
  const labels = Object.keys(sortedObj);
  const values = Object.values(sortedObj);
  const sliceColors = [];
  // If we have more data than colors, group the last items as "Other"
  const lblOther = "Other";
  // Array of colors defined in chart-utils.js
  //const maxColors = COLORS.length - 1;
  //console.log("Max colors:", maxColors, ", Values.length:", values.length);

  let displayLabels = labels.slice();
  let displayValues = values.slice();

  if (displayValues.length > maxColors) {
    const otherValue = displayValues
      .slice(maxColors)
      .reduce((a, b) => a + b, 0);
    displayValues = displayValues.slice(0, maxColors);
    displayLabels = displayLabels.slice(0, maxColors);
    displayValues.push(otherValue);
    displayLabels.push(lblOther);
  }

  for (let i = 0; i < displayValues.length; i++) {
    sliceColors.push(getSliceColor(i < maxColors ? i : maxColors));
  }

  return {
    id: id,
    type: "pie",
    data: {
      labels: displayLabels,
      datasets: [
        {
          label: sliceLabel,
          data: displayValues,
          backgroundColor: sliceColors,
          borderWidth: 1,
        },
      ],
    },
    options: {
      hoverOffset: 20,
      plugins: {
        legend: {
          display: true,
        },
        datalabels: {
          color: "white",
          align: "end",
        },
        title: {
          display: true,
          text: chartTitle,
          color: "black",
          position: "bottom",
          align: "center",
          font: { weight: "bold" },
        },
      },
    },
  };
}
