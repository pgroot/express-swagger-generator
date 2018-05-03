/**
 * Created by GROOT on 3/27 0027.
 */
/** @module index */
"use strict";

// Dependencies
const fs = require("fs");
const glob = require("glob");
const path = require("path");
const parser = require("swagger-parser");
const swaggerHelpers = require("./swagger-helpers");
const doctrineFile = require("doctrine-file");
const swaggerUi = require("swagger-ui-express");

/**
 * Parses the provided API file for JSDoc comments.
 * @function
 * @param {string} file - File to be parsed
 * @returns {object} JSDoc comments
 * @requires doctrine
 */
function parseApiFile(file) {
  const content = fs.readFileSync(file, "utf-8");

  let comments = doctrineFile.parseFileContent(content, {
    unwrap: true,
    sloppy: true,
    tags: null,
    recoverable: true
  });
  return comments;
}

function parseRoute(str) {
  let split = str.split(" ");

  return {
    method: split[0].toLowerCase() || "get",
    uri: split[1] || ""
  };
}
function parseField(str) {
  let split = str.split(".");
  return {
    name: split[0],
    parameter_type: split[1] || "get",
    required: (split[2] && split[2] === "required") || false
  };
}
function parseType(obj) {
  if (!obj) return undefined;
  if (!obj.name) return "string";
  const spl = obj.name.split(".");
  if (spl.length > 1 && spl[1] == "model") {
    return spl[0];
  } else return obj.name;
}
function parseSchema(obj) {
  const type = obj["type"];
  const description = obj["description"];
  if (!type.name) return undefined;

  const spl = type.name.split(".");
  if (spl.length > 1 && spl[1] == "model") {
    return { $ref: "#/definitions/" + spl[0] };
  }

  if (type.name === "string" && description.startsWith("@enum")) {
    const clean = description.replace(/\'/g, "").replace(/"/g, "");
    const enums = clean.split("@enum")[1];
    return { enum: enums };
  }

  return undefined;
}
function parseReturn(tags) {
  let rets = {};
  for (let i in tags) {
    if (tags[i]["title"] == "returns" || tags[i]["title"] == "return") {
      let description = tags[i]["description"].split("-");
      rets[description[0]] = { description: description[1] };
      const type = parseType(tags[i].type);
      if (type) {
        rets[description[0]].type = type;
        rets[description[0]].schema = parseSchema(tags[i]);
      }
    }
  }
  return rets;
}
function parseDescription(obj) {
  return obj.description || "";
}
function parseTag(tags) {
  for (let i in tags) {
    if (tags[i]["title"] == "group") {
      return tags[i]["description"].split("-");
    }
  }
  return ["default", ""];
}

function parseTypedef(tags) {
  const typeName = tags[0]["name"];
  let details = {
    required: [],
    properties: {}
  };
  for (let i = 1; i < tags.length; i++) {
    if (tags[i].title == "property") {
      let propName = tags[i].name;
      const required = propName.split(".")[1];
      if (required && required == "required") {
        propName = propName.split(".")[0];
        details.required.push(propName);
      }
      details.properties[propName] = {
        type: parseType(tags[i].type),
        schema: parseSchema(tags[i])
      };
    }
  }
  return { typeName, details };
}

function fileFormat(comments) {
  let route,
    parameters = {},
    params = [],
    tags = [],
    definitions = {};
  for (let i in comments) {
    let desc = parseDescription(comments);
    if (i == "tags") {
      if (
        comments[i].length > 0 &&
        comments[i][0]["title"] &&
        comments[i][0]["title"] == "typedef"
      ) {
        const typedefParsed = parseTypedef(comments[i]);
        definitions[typedefParsed.typeName] = typedefParsed.details;
        continue;
      }
      for (let j in comments[i]) {
        let title = comments[i][j]["title"];
        if (title == "route") {
          route = parseRoute(comments[i][j]["description"]);
          let tag = parseTag(comments[i]);
          parameters[route.uri] = parameters[route.uri] || {};
          parameters[route.uri][route.method] =
            parameters[route.uri][route.method] || {};
          parameters[route.uri][route.method]["parameters"] = [];
          parameters[route.uri][route.method]["description"] = desc;
          parameters[route.uri][route.method]["tags"] = [tag[0]];
          tags.push({
            name: tag[0],
            description: tag[1]
          });
        }
        if (title == "param") {
          let field = parseField(comments[i][j]["name"]);
          params.push({
            name: field.name,
            in: field.parameter_type,
            description: comments[i][j]["description"],
            required: field.required,
            type: parseType(comments[i][j]["type"]),
            schema: parseSchema(comments[i][j])
          });
        }
        parameters[route.uri][route.method]["parameters"] = params;
        parameters[route.uri][route.method]["responses"] = parseReturn(
          comments[i]
        );
      }
    }
  }
  return { parameters: parameters, tags: tags, definitions: definitions };
}

/**
 * Filters JSDoc comments
 * @function
 * @param {object} jsDocComments - JSDoc comments
 * @returns {object} JSDoc comments
 * @requires js-yaml
 */
function filterJsDocComments(jsDocComments) {
  return jsDocComments.filter(function(item) {
    return item.tags.length > 0;
  });
}

/**
 * Converts an array of globs to full paths
 * @function
 * @param {array} globs - Array of globs and/or normal paths
 * @return {array} Array of fully-qualified paths
 * @requires glob
 */
function convertGlobPaths(base, globs) {
  return globs.reduce(function(acc, globString) {
    let globFiles = glob.sync(path.resolve(base, globString));
    return acc.concat(globFiles);
  }, []);
}

/**
 * Generates the swagger spec
 * @function
 * @param {object} options - Configuration options
 * @returns {array} Swagger spec
 * @requires swagger-parser
 */
module.exports = function(app) {
  return function(options) {
    /* istanbul ignore if */
    if (!options) {
      throw new Error("'options' is required.");
    } /* istanbul ignore if */ else if (!options.swaggerDefinition) {
      throw new Error("'swaggerDefinition' is required.");
    } /* istanbul ignore if */ else if (!options.files) {
      throw new Error("'files' is required.");
    }

    // Build basic swagger json
    let swaggerObject = swaggerHelpers.swaggerizeObj(options.swaggerDefinition);
    let apiFiles = convertGlobPaths(options.basedir, options.files);

    // Parse the documentation in the APIs array.
    for (let i = 0; i < apiFiles.length; i = i + 1) {
      let parsedFile = parseApiFile(apiFiles[i]);
      //console.log(JSON.stringify(parsedFile))
      let comments = filterJsDocComments(parsedFile);

      for (let j in comments) {
        let parsed = fileFormat(comments[j]);
        swaggerHelpers.addDataToSwaggerObject(swaggerObject, [
          {
            paths: parsed.parameters,
            tags: parsed.tags,
            definitions: parsed.definitions
          }
        ]);
      }
    }

    parser.parse(swaggerObject, function(err, api) {
      if (!err) {
        swaggerObject = api;
      }
    });

    app.use("/api-docs.json", function(req, res) {
      res.json(swaggerObject);
    });

    if (!options.docUrl) {
      options.docUrl = "/api-docs";
    }

    app.use(options.docUrl, swaggerUi.serve, swaggerUi.setup(swaggerObject));

    return swaggerObject;
  };
};
