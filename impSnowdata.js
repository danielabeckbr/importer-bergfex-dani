const mysql = require("mysql");
const config = require("config");
const argv = require("minimist")(process.argv.slice(2));
const cron = require("node-cron");
const datetime = require("node-datetime");
const express = require("express");

const tools = require("./lib/bfTools");

const version = "1.0.0 (17.11.2020)";
const programmName = "impSnowdata.js";

/*

 The script should be read snowdata from WEB (or file) and write it in Database

 steps are:
 1. read XML-Data
 2. parse XML and extract with xpath-patterns the snowdata
 3. delete old snowdata
 4. write snowreport
 5. write snowreportdetail-data
 6. reset snwodata-cache from applicationservers

 */

let cfg = {xmlFile: ""};
let sql = {};
let global = {logMsgLevelWarn: "snowimport started ...\n", starttime: null, dt: datetime.create()}

const processArgs = () => {

    if (argv.v || argv.version) {
        console.log(`${programmName} version ${version} started at ` + global.dt.format("d.m.Y H:M:S"));
        process.exit();
    }

    if (argv.f) {
        if (argv.f === true) {
            cfg.xmlFile = "test/impSnowdata.xml";
        } else {
            cfg.xmlFile = argv.f;
        }
    }

    if (argv.h || argv.help) {
        let text = `usage:

${programmName}

-f importFile             -use import data from testfile 'importFile'
[-v  --version]           -show programm version
[-h  --help]              -help information
`;

        console.log(text);
        process.exit();
    }
}

const getCfg = () => {

    console.log('NODE_CONFG_DIR: ' + config.util.getEnv('NODE_CONFIG_DIR'));

    cfg.dbConfig = config.get("Customer.dbConfig");

    cfg.msgDBConnect = `DB connect Host: ${cfg.dbConfig.host}\n`

    console.log(cfg.msgDBConnect);

    cfg.refreshSnowcache = config.get("Customer.snowData.refreshSnowcache");

    cfg.snowParamIds = config.get("Customer.snowData.snowParamIds");
    cfg.xpathListSnowData = config.get("Customer.snowData.xpathConfig");
    cfg.bergSnowDataUrl = config.get("Customer.snowData.bergfexUrl");
    cfg.logLevel = config.get("Customer.snowData.log");
    cfg.cronpattern = config.get("Customer.snowData.cron");

    if (cfg.logLevel == "debug") {
        let configname = config.get("Customer.configname");
        console.log("use config: " + configname);
    }

    console.log(`logLevel: ${cfg.logLevel}`)
}

const manageSnowData = async (xmlData) => {
    // console.log("xml:", xmlData);

    let connection = mysql.createConnection(cfg.dbConfig);
    tools.setConnection(connection);

    if (argv.delSnowReports) {
        init();
    }

    let snowData = getSnowDataFromXml(xmlData);

    connection.beginTransaction(async function (err) {
        if (err) {
            console.log("Error ende write");

            throw err;
        }

        await wrtSnowDataToDB(snowData);

        await tools.dbCommit(connection);

        if (cfg.logLevel == "debug") {
            console.log("finaly connection end");
        }

        connection.end();

        resetSnowcache();
    });
};

const resetSnowcache = async () => {
    if (cfg.refreshSnowcache.afterImport) {
        const server = cfg.refreshSnowcache.server.split(",");

        for (let nr = 0; nr < server.length; nr++) {
            const url = server[nr] + cfg.refreshSnowcache.urlcmd

            let msg = `Refresh SnowCache URL: ${url}\n`;
            console.log(msg);
            global.logMsgLevelWarn += msg + "\n";

            await tools.fetchData(url, (data) => {
                let msg = `Server Response: ${data}\n`;
                console.log(`Server Response: ${data}\n`);
                global.logMsgLevelWarn += msg + "\n";
            });
        }
        calcEndTime();

    } else {
        console.log("Koorin snow cache reset NOT active!");
    }
}

const calcEndTime = () => {
    let endtime = new Date() - global.starttime;

    endtime = endtime / 1000;

    let dt = datetime.create();

    msg = "import Bergfex snow end: " + dt.format("d.m.Y H:M:S") + ` execution time: ${endtime}s\n`;

    global.logMsgLevelWarn += msg;

    console.log(msg);
}

sql.truncateSnowValues = "truncate table snow_report_element";

const init = async () => {
    await tools
        .queryPromise(sql.truncateSnowValues)
        .then(async () => {
            await tools.queryPromise(sql.truncateSnowValues);
        })
        .catch((err) => {
            console.log("prepare snowReport err: ", err.message);
        });
};

const wrtSnowDataToDB = async (snowData) => {
    const selectArea =
        "select skiarea_id from ski_area where bergfex_skiarea_id = ?";

    let insertCount = {ok: 0, err: 0};

    for (let id = 0; id < snowData.length; id++) {
        let data = [snowData[id].resort];

        let result = await tools.queryPromise(selectArea, data);

        if (cfg.logLevel == "debug") {
            console.log("result: ", result);
        }

        if (!result || result.length < 1) {
            let msg = "Error zu Skiarea '" +
                snowData[id].resort +
                "' no skiarea_id found!";

            console.log(msg);
            global.logMsgLevelWarn += msg + "\n";

            continue;
        }

        if (!snowData[id].snowreportid) {
            continue;
        }
        await deleteOldSnowReport(data);

        if (await wrtResortSnowReport(data, snowData, id, result, insertCount)) {
            let snowreportid = parseInt(snowData[id].snowreportid);

            await wrtResortSnowReportDetails(snowreportid, id, snowData, insertCount);
        }
    }

    let msg = `Snowdata insert count:    OK = ${insertCount.ok}     Error = ${insertCount.err}\n`
    global.logMsgLevelWarn += msg;

    console.log(msg);
};

const insSnRpElement =
    "insert into snow_report_element (snow_report_id,snow_value_type_id,value)\nvalues ";

const wrtResortSnowReportDetails = async (snowreportid, id, snowData, insertCount) => {

    let snowValueTypes = Object.keys(cfg.snowParamIds);
    let insertRows = "";

    for (let typeId = 0; typeId < snowValueTypes.length; typeId++) {

        try {
            let typeName = snowValueTypes[typeId];
            let snowValue = snowData[id][typeName];
            let param = cfg.snowParamIds[typeName];

            if (typeName == "snowReportDate") {
                let reTime = /(\d\d\d\d)-(\d\d)-(\d\d) (\d\d:\d\d):\d\d$/;
                if (snowValue && snowValue.match(reTime)) {
                    snowValue = snowValue.replace(reTime, "$3.$2.$1 $4");
                }
            }

            if (snowValue) {
                insertRows += `(${snowreportid}, ${param}, '${snowValue}'),\n`;
            }
        } catch (e) {
            console.log("wrtResortSnowReportDetails: ", e);
            continue;
        }
    }

    if (insertRows == "") {
        return
    }

    insertRows = insertRows.replace(/,\n$/g, "");
    let insert = insSnRpElement + insertRows;
    if (cfg.logLevel == "debug") {
        console.log("\ninsert snowreport: ", insert);
    }

    await tools
        .queryPromise(insert, "", "insert SnowReportValues")
        .then(() => {
            insertCount.ok++;
        })
        .catch((err) => {
            insertCount.err++;
        });
}

const deleteOldSnowReportsDetailArea = `delete
                                        from snow_report_element
                                        where snow_report_id in
                                              (select snow_report_id
                                               from snow_report a,
                                                    ski_area b
                                               where a.skiarea_id = b.skiarea_id
                                                 and bergfex_skiarea_id = ?)`;

const deleteOldSnowReportsArea = `delete
                                  from snow_report
                                  where skiarea_id in
                                        (select skiarea_id from ski_area where bergfex_skiarea_id = ?)`;

const deleteOldSnowReport = async (data) => {
    await tools
        .queryPromise(
            deleteOldSnowReportsDetailArea,
            data,
            "delete OldSnowReportsDetail",
            0,
            0
        )
        .catch((err) => {
            console.log(err.message);
            return;
        });


    await tools
        .queryPromise(
            deleteOldSnowReportsArea,
            data,
            "delete OldSnowReports",
            0,
            0
        )
        .catch((err) => {
            console.log(err.message);
            return;
        });
}

const insSnReport = `insert into snow_report
                     (snow_report_id, snow_report_type_id, skiarea_id, report_date, last_update)
                     values (?, 2, ?, STR_TO_DATE(?, '%Y-%m-%d %H:%i:%S'), now())`;

const wrtResortSnowReport = async (data, snowData, id, result, insertCount) => {

    let snowreportid = parseInt(snowData[id].snowreportid);
    tools.emptyDateToNull(snowData[id], ["reportDate"]);

    data = [
        snowData[id].snowreportid,
        result[0].skiarea_id,
        snowData[id].reportDate,
    ];

    let wrtStatus = true;

    wrtStatus = await tools
        .queryPromise(insSnReport, data, "insert SnowReport", 0, 0)
        .catch((err) => {
            console.log(err.message);
            return false;
        });

    if (
        (typeof wrtStatus === "boolean" && !wrtStatus) ||
        !wrtStatus.affectedRows
    ) {
        return false;
    }

    return true;
}

const getSnowDataFromXml = (xmlData) => {
    let result = [];

    result = tools.getResultFromXml(
        "//snowreports/*",
        result,
        xmlData,
        getResortSnowdataFromXML
    );

    return result;
};

const getResortSnowdataFromXML = (result, xmlNode) => {
    let snowData = result;

    let attributeNames = Object.keys(cfg.xpathListSnowData);

    let resortSnowData = {};

    for (let xpathId = 0; xpathId < attributeNames.length; xpathId++) {
        let nodeName = attributeNames[xpathId];
        let nodeXpath = cfg.xpathListSnowData[nodeName][0];
        let nodeAttribute = cfg.xpathListSnowData[nodeName][1];

        let snowNode = tools.getNodeContent(xmlNode, nodeXpath, nodeAttribute);

        if (nodeName == "tobogganRunOpen") {
            if (snowNode.length > 0) {
                snowNode.nodeValue = true;
            } else {
                snowNode.nodeValue = false;
            }
        }

        resortSnowData[nodeName] = snowNode.nodeValue;
    }

    snowData.push(resortSnowData);

    return result;
};

const startimport = () => {
    global.logMsgLevelWarn = cfg.msgDBConnect;

    let dt = datetime.create();

    let msg = "import Bergfex snow start: " + dt.format("d.m.Y H:M:S") + "\n";
    console.log(msg);

    global.logMsgLevelWarn += msg;

    global.starttime = new Date();
    tools.fetchData(cfg.bergSnowDataUrl, manageSnowData, cfg.xmlFile);
};

processArgs();

getCfg();

if (argv.cron) {
    const PORT = 8080;

// App
    const app = express();
    app.get("/snowimport/status", function (req, res) {
        let htmlLog = global.logMsgLevelWarn.replace(/\n/g, "<br>\n<br>\n");

        let baseInfoImporter = `importer bergfex snow Version ${version}<br>Started at ` + global.dt.format("d.m.Y H:M:S") + "<br>";

        res.send(`${baseInfoImporter}<br><br>${htmlLog}\n`);
    });

    app.listen(PORT);

    console.log("Running on http://YOURHOST:" + PORT);

    let msg = "start cronjob " + cfg.cronpattern;
    console.log(msg);
    global.logMsgLevelWarn += msg + "\n";

    cron.schedule(cfg.cronpattern, () => {
        startimport();
    });
} else {
    startimport();
}
