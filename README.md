# stake-client

## Create keystore

```
docker run --rm \
   -it \
   -v "$(pwd):/app" \
   -w $(pwd) \
   parallelfinance/stake-client:latest \
   create \
   keystore \
   --keystore-path /app/keystore
```

## Claim for unbonded

```
docker run \
   -it \
   -v "$(pwd):/app" \
   parallelfinance/stake-client:latest \
   claim \
   --para-ws wss://heiko-rpc.parallel.fi \
   --batch-size 50 \
   --keystore-path /app/keystore
```

## Sync relaychain ledger to parachain

```
docker run \
   -it \
   -v "$(pwd):/app" \
   parallelfinance/stake-client:latest \
   sync \
   ledger \
   --relay-ws wss://kusama-rpc.parallel.fi \
   --para-ws wss://heiko-rpc.parallel.fi \
   --keystore-path /app/keystore \
   --derivative-index 0
```

## Sync relaychain era to parachain

```
docker run \
   -it \
   -v "$(pwd):/app" \
   parallelfinance/stake-client:latest \
   sync \
   era \
   --relay-ws wss://kusama-rpc.parallel.fi \
   --para-ws wss://heiko-rpc.parallel.fi \
   --keystore-path /app/keystore
```

## Select kusama validators

```
docker run \
  --rm \
  parallelfinance/stake-client:latest \
  get \
  best-validators \
  --min-stakes 4000 \
  --max-stakes 5500 \
  --relay-ws wss://kusama-rpc.polkadot.io \
  --para-ws wss://heiko-rpc.parallel.fi
```

## Select polkadot validators

```
docker run \
  --rm \
  parallelfinance/stake-client:latest \
  get \
  best-validators \
  --min-stakes 1600000 \
  --max-stakes 2500000 \
  --relay-ws wss://rpc.polkadot.io \
  --para-ws wss://rpc.parallel.fi
```
