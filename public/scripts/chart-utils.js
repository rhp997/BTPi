// Epicor blue
const epicorBlue = "rgb(49,144,214)";
// Epicor light gray
const epicorLightGray = "rgb(239,243,239)";

// Define a set of colors to use for the pie chart. If there are more data points than colors, the last color will be used for "Other"
const COLORS = [
  "#4dc9f6",
  "#f67019",
  "#f53794",
  "#537bc4",
  "#acc236",
  "#166a8f",
  "#00a950",
  "#58595b",
  "#8549ba",
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
      responsive: false,
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
function getSliceColor(index) {
  return COLORS[index % COLORS.length];
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
