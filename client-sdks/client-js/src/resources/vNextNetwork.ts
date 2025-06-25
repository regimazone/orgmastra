import type { WatchEvent } from '@mastra/core/workflows';

import type {
  ClientOptions,
  GetVNextNetworkResponse,
  GenerateVNextNetworkResponse,
  LoopVNextNetworkResponse,
  GenerateOrStreamVNextNetworkParams,
  LoopStreamVNextNetworkParams,
} from '../types';

import { BaseResource } from './base';

const RECORD_SEPARATOR = '\x1E';

export class VNextNetwork extends BaseResource {
  constructor(
    options: ClientOptions,
    private networkId: string,
  ) {
    super(options);
  }

  /**
   * Retrieves details about the network
   * @returns Promise containing vNext network details
   */
  details(): Promise<GetVNextNetworkResponse> {
    return this.request(`/api/networks/v-next/${this.networkId}`);
  }

  /**
   * Generates a response from the v-next network
   * @param params - Generation parameters including message
   * @returns Promise containing the generated response
   */
  generate(params: GenerateOrStreamVNextNetworkParams): Promise<GenerateVNextNetworkResponse> {
    return this.request(`/api/networks/v-next/${this.networkId}/generate`, {
      method: 'POST',
      body: params,
    });
  }

  /**
   * Generates a response from the v-next network using multiple primitives
   * @param params - Generation parameters including message
   * @returns Promise containing the generated response
   */
  loop(params: { message: string }): Promise<LoopVNextNetworkResponse> {
    return this.request(`/api/networks/v-next/${this.networkId}/loop`, {
      method: 'POST',
      body: params,
    });
  }

  private async *streamProcessor(stream: ReadableStream): AsyncGenerator<WatchEvent, void, unknown> {
    const reader = stream.getReader();

    // Track if we've finished reading from the stream
    let doneReading = false;
    // Buffer to accumulate partial chunks
    let buffer = '';
    let v = null;

    try {
      while (!doneReading) {
        try {
          // Read the next chunk from the stream
          const { done, value } = await reader.read();
          doneReading = done;
          v = value;
          console.log('doneReading==', doneReading);
          console.log('value==', value);
          console.log('done===', done);

          // Skip processing if we're done and there's no value
          if (done && !value) continue;

          try {
            // Decode binary data to text
            const decoded = value ? new TextDecoder().decode(value) : '';
            console.log('decoded==', decoded);

            // Split the combined buffer and new data by record separator
            const chunks = (buffer + decoded).split(RECORD_SEPARATOR);

            // The last chunk might be incomplete, so save it for the next iteration
            buffer = chunks.pop() || '';

            console.log('chunks==', chunks);

            // Process complete chunks
            for (const chunk of chunks) {
              if (chunk) {
                // Only process non-empty chunks
                if (typeof chunk === 'string') {
                  try {
                    const parsedChunk = JSON.parse(chunk);
                    console.log('parsedChunk==', parsedChunk);
                    yield parsedChunk;
                  } catch (err) {
                    console.log('error parsing chunk==', err);
                    // Silently ignore parsing errors to maintain stream processing
                    // This allows the stream to continue even if one record is malformed
                  }
                }
              }
            }
          } catch (err) {
            console.log('error in streamProcessor==', err);
            // Silently ignore parsing errors to maintain stream processing
            // This allows the stream to continue even if one record is malformed
          }
        } catch (err) {
          console.log('error in await reader.read()==', err);
        }
      }

      console.log('after while loop');

      // Process any remaining data in the buffer after stream is done
      if (buffer) {
        try {
          yield JSON.parse(buffer);
        } catch {
          // Ignore parsing error for final chunk
        }
      }

      console.log('reader about to cancel', { doneReading, v });

      reader
        .cancel()
        .then(() => {
          console.log('reader cancelled');
        })
        .catch(() => {
          // Ignore cancel errors
        });
    } catch (err) {
      console.log('erroorrrr==', err);
    }
  }

  /**
   * Streams a response from the v-next network
   * @param params - Stream parameters including message
   * @returns Promise containing the results
   */
  async stream(params: GenerateOrStreamVNextNetworkParams, onRecord: (record: WatchEvent) => void) {
    const response: Response = await this.request(`/api/networks/v-next/${this.networkId}/stream`, {
      method: 'POST',
      body: params,
      stream: true,
    });

    if (!response.ok) {
      throw new Error(`Failed to stream vNext network: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    for await (const record of this.streamProcessor(response.body)) {
      if (typeof record === 'string') {
        onRecord(JSON.parse(record));
      } else {
        onRecord(record);
      }
    }
  }

  /**
   * Streams a response from the v-next network loop
   * @param params - Stream parameters including message
   * @returns Promise containing the results
   */
  async loopStream(params: LoopStreamVNextNetworkParams, onRecord: (record: WatchEvent) => void) {
    const response: Response = await this.request(`/api/networks/v-next/${this.networkId}/loop-stream`, {
      method: 'POST',
      body: params,
      stream: true,
    });

    if (!response.ok) {
      throw new Error(`Failed to stream vNext network loop: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    for await (const record of this.streamProcessor(response.body)) {
      if (typeof record === 'string') {
        onRecord(JSON.parse(record));
      } else {
        onRecord(record);
      }
    }
  }
}
