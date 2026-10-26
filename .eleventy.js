const sections = require("./src/_data/sections.json");

// Для GitHub Pages сайт живёт в подпапке, например /maritime-academy/.
const PREFIX = (process.env.PATH_PREFIX || "/").replace(/\/?$/, "/");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addGlobalData("base", PREFIX);

  eleventyConfig.addCollection("articles", (api) =>
    api
      .getFilteredByGlob("src/content/**/*.md")
      .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0))
  );

  eleventyConfig.addFilter("plain", (html) =>
    (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );

  eleventyConfig.addFilter("sectionTitle", (id) => {
    const found = sections.find((s) => s.id === id);
    return found ? found.title : "";
  });

  if (PREFIX !== "/") {
    eleventyConfig.addTransform("path-prefix", function (content) {
      const out = this.page.outputPath || "";
      if (out.endsWith(".html")) {
        return content.replace(/(href|src|action)="\/(?!\/)/g, `$1="${PREFIX}`);
      }
      if (out.endsWith(".json")) {
        return content.replace(/("url":\s*")\/(?!\/)/g, `$1${PREFIX}`);
      }
      return content;
    });
  }

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
