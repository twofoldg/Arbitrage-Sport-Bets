import yargs from 'yargs';
import axios from 'axios';
import boxen from 'boxen';
import chalk from 'chalk';
import { hideBin } from 'yargs/helpers';
import fs from 'fs/promises';

const API_KEY = '5266deff241e1c38c9e29b9340823f54';

const log = console.log;
const error = chalk.bold.red;
const warning = chalk.yellow;
const success = chalk.bold.green;

const getArguments = () => {
  const { argv } = yargs(hideBin(process.argv));
  const {
    demo = false,
    demo_file = './test_data.json',
    bet = 100,
    sport = 'upcoming',
    region = 'eu',
    verbose = false,
  } = argv;

  return { demo, demo_file, bet, sport, region, verbose };
};

const getOddsData = async (demo, demo_file, sport, region) => {
  if (demo) {
    try {
      const file = await fs.readFile(demo_file);
      const data = JSON.parse(file);
      return data.data;
    } catch (err) {
      throw new Error(`Failed to collect data: Could not get demoFile: ${demo_file}`);
    }
  } else {
    try {
      const response = await axios.get(
        `https://api.the-odds-api.com/v3/odds/?apiKey=${API_KEY}&sport=${sport}&region=${region}&mkt=h2h`
      );
      return response.data.data;
    } catch (err) {
      throw new Error(`Failed to collect data: ${err.message}`);
    }
  }
};

const processOddsData = (data) => {
  return data.map((match) => {
    const oddsMatrix = match.sites.map((site) =>
      site.odds.h2h.map((odd, index) => ({ site: site.site_key, odd, index }))
    );

    const highestOdds = oddsMatrix.flat().reduce((acc, current) => {
      if (!acc[current.index] || current.odd > acc[current.index].odd) {
        acc[current.index] = current;
      }
      return acc;
    }, []);

    const arbitrage = highestOdds.reduce((sum, { odd }) => sum + 1 / odd, 0) * 100;

    return { match, highestOdds, arbitrage };
  });
};

const displayResults = (processedData, bet) => {
  let totalProfit = 0;
  let profitableMatches = 0;

  processedData.forEach(({ match, highestOdds, arbitrage }) => {
    log(`Checking for arbitrage on ${match.sport_key}, ${match.teams.toString()}`);

    if (arbitrage < 100) {
      profitableMatches++;

      log(success(`Profitable arbitrage found at ${Math.floor(arbitrage)}, calculating ideal wagers`));

      const wagers = highestOdds.map((highestOdd, index) => {
        if (highestOdd === undefined || highestOdd.odd === undefined) {
          log(error(`!! Undefined value detected for highestOdd or highestOdd.odd in match ${match.sport_key}, ${match.teams.toString()}`));
          return null;
        }

        let betAmount = 1;
        for (let k = 0; k < highestOdds.length; k++) {
          if (k !== index) {
            let odd = highestOdds[k].odd;
            let oddForOutcome = highestOdd.odd / odd;
            betAmount += oddForOutcome;
          }
        }

        let wager = (bet / betAmount);
        let profit = (wager * highestOdd.odd) - bet;

        return { site: highestOdd.site, wager: wager.toFixed(2), odd: highestOdd.odd, profit: profit.toFixed(2) };
      });

      // Filter out any null wagers
      const validWagers = wagers.filter(wager => wager !== null);

      if (validWagers.length > 0) {
        log(success('Found ideal wagers'));

        validWagers.forEach(({ site, odd, wager }, index) => {
          log(success(`Selection ${index}(${odd}) on ${site} with $${wager}`));
        });

        log(success(`Profit if win: $${validWagers[0].profit}`));

        totalProfit += parseFloat(validWagers[0].profit);
      } else {
        log(error('No valid wagers found for this match.\n'));
      }
    } else {
      log(error(`No profitable arbitrage found.\n`));
    }
  });

  if (profitableMatches > 0) {
    log(`Successfully found a total of ${success(profitableMatches)} possible arbitrage bets with a total potential profit of ${success(totalProfit.toFixed(2))}`);
  } else {
    log(error(`Could not find any arbitrage bets for the given data.`));
  }
};

const findArbBets = async () => {
  log(boxen('BetArbit v1.0.0', { padding: 1, margin: 1, backgroundColor: 'cyan', borderStyle: 'double', borderColor: 'cyan' }));
  log(warning('Arbitrage gambling has a variety of factors that can negatively affect profit. Do not use this cli to place real-world bets.'));
  log('Starting...');

  const { demo, demo_file, bet, sport, region, verbose } = getArguments();

  if (verbose) {
    log(`
      ${chalk.green('Arguments')}
      demo: ${chalk.green(demo)}
      demoFile: ${chalk.green(demo_file)}
      bet: ${chalk.green(bet)}
      sport: ${chalk.green(sport)}
      region: ${chalk.green(region)}
    `);
  }

  try {
    const oddsData = await getOddsData(demo, demo_file, sport, region);
    const processedData = processOddsData(oddsData);
    displayResults(processedData, bet);
  } catch (err) {
    log(error(`!! ${err.message}`));
    process.exit(1);
  }
};

findArbBets();
