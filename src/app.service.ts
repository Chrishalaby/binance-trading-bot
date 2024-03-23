import { Injectable } from '@nestjs/common';
import Binance, {
  NewFuturesOrder,
  OrderSide_LT,
  OrderType,
} from 'binance-api-node';
import OpenAI from 'openai';
import * as WebSocket from 'ws';
@Injectable()
export class AppService {
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // OR JUST ADD THEM DIRECTLY HERE
  });
  private client = Binance({
    apiKey: process.env.BINANCE_API_KEY, // OR JUST ADD THEM DIRECTLY HERE
    apiSecret: process.env.BINANCE_API_SECRET, // OR JUST ADD THEM DIRECTLY HERE
  });

  constructor() {
    this.subscribeToFuturesMarket('btcusdt'); // Lowercase for WebSocket streams
  }

  subscribeToFuturesMarket(symbol: string) {
    const ws = new WebSocket(
      `wss://fstream.binance.com/ws/${symbol}@markPrice`,
    );

    ws.on('message', async (data) => {
      const marketData = JSON.parse(data.toString());
      const decision: OrderSide_LT =
        await this.askChatGPTAboutMarket(marketData); // Implement this similarly to previous examples

      if (decision == 'BUY' || decision === 'SELL') {
        await this.executeFuturesTrade(symbol.toUpperCase(), decision, 10); // Execute with x10 leverage
      }
    });
  }

  async executeFuturesTrade(
    symbol: string,
    decision: OrderSide_LT,
    leverage: number,
  ): Promise<void> {
    await this.client.futuresLeverage({ symbol: symbol, leverage: leverage });

    const order: NewFuturesOrder = {
      symbol: symbol,
      side: decision,
      type: 'MARKET',
      quantity: '1',
    };

    const response = await this.client.futuresOrder(order);
    console.log('Trade executed', response);
  }

  async getMarketData(symbol: string): Promise<any> {
    const trades = await this.client.trades({ symbol: symbol, limit: 10 });
    return trades;
  }

  async askChatGPTAboutMarket(data: any): Promise<OrderSide_LT> {
    const prompt = `Given the recent market data: ${JSON.stringify(data)}, should I buy or sell?`;
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            'You are a financial advisor. Provide concise trading advice: buy or sell.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 60,
      temperature: 0.7,
    });
    // Expecting a direct "buy" or "sell" response
    const decision = response.choices[0].message.content.trim().toLowerCase();
    let decisionRegex: OrderSide_LT = decision as OrderSide_LT;
    if (decision !== 'buy' && decision !== 'sell') {
      throw new Error('Invalid trading decision');
    } else if (decision === 'buy') {
      decisionRegex = 'BUY';
      return decisionRegex;
    } else if (decision === 'sell') {
      decisionRegex = 'SELL';
      return decisionRegex;
    }
  }

  async executeTrade(symbol: string, decision: string): Promise<any> {
    // Simplified example. In real use, include quantity, price, and other necessary parameters
    if (decision === 'buy') {
      return await this.client.order({
        symbol: symbol,
        side: 'BUY',
        type: OrderType.MARKET,
        quantity: '1', // Set your quantity
      });
    } else if (decision === 'sell') {
      return await this.client.order({
        symbol: symbol,
        side: 'SELL',
        type: OrderType.MARKET,
        quantity: '1', // Set your quantity
      });
    } else {
      throw new Error('Invalid trading decision');
    }
  }

  async getTradeDecision(): Promise<string> {
    const symbol = 'BTCUSDT';
    const marketData = await this.getMarketData(symbol);
    const decision = await this.askChatGPTAboutMarket(marketData);
    const tradeResult = await this.executeTrade(symbol, decision);
    return `Executed ${decision} order: ${JSON.stringify(tradeResult)}`;
  }
}
