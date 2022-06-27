DOCKER_TAG     											:= latest

.PHONY: image
image:
	docker build \
		-c 512 \
		-t parallelfinance/stake-client:$(DOCKER_TAG) \
		-f Dockerfile.release \
		. \
		--network=host

.PHONY: current-validators
current-validators:
	curl 'https://api.subquery.network/sq/parallel-finance/relaychain-subql' \
		-X POST \
		-H 'Content-Type: application/json' \
		-H 'Origin: https://explorer.subquery.network' \
		--data-raw '{"query":"query {\n    validators (first: 24) {\n        nodes {\n             derivativeIndex\n        stashId\n        name\n        stakes\n        commission\n        blockHeight\n\n        }\n    }\n}","variables":null}' \
		| jq
