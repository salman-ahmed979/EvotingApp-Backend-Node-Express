const { promises: fs } = require("fs");

const getData = async (filePath) => {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
};

module.exports = getData;
